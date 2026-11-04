import sqlite3
import os
import json
import pymysql

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, 'database', 'clipper.db')
SCHEMA_PATH = os.path.join(BASE_DIR, 'database', 'schema_sqlite.sql')

def init_sqlite():
    print(f"Initializing SQLite database at: {DB_PATH}")
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
        conn.executescript(f.read())
    conn.commit()
    return conn

def migrate_from_mysql(sqlite_conn):
    try:
        my_conn = pymysql.connect(
            host='127.0.0.1',
            port=3306,
            user='root',
            password='',
            database='ai_clipper',
            cursorclass=pymysql.cursors.DictCursor
        )
        print("Connected to MySQL successfully. Starting data migration...")
    except Exception as e:
        print(f"MySQL not accessible or empty ({e}). Initialized fresh SQLite database.")
        return

    tables = ['users', 'projects', 'transcripts', 'clips', 'clip_edits', 'exports', 'settings']
    with my_conn.cursor() as cur:
        for t in tables:
            try:
                cur.execute(f"SELECT * FROM {t}")
                rows = cur.fetchall()
                if not rows:
                    continue
                print(f"Migrating table `{t}` ({len(rows)} rows)...")
                cols = list(rows[0].keys())
                placeholders = ', '.join(['?'] * len(cols))
                col_names = ', '.join([f'"{c}"' for c in cols])
                
                insert_sql = f"INSERT OR REPLACE INTO {t} ({col_names}) VALUES ({placeholders})"
                
                sqlite_rows = []
                for r in rows:
                    row_vals = []
                    for c in cols:
                        val = r[c]
                        if isinstance(val, (dict, list)):
                            val = json.dumps(val)
                        row_vals.append(val)
                    sqlite_rows.append(row_vals)
                
                sqlite_conn.executemany(insert_sql, sqlite_rows)
                sqlite_conn.commit()
            except Exception as ex:
                print(f"Note: Error migrating table {t}: {ex}")

    my_conn.close()
    print("Migration from MySQL to SQLite completed!")

if __name__ == '__main__':
    conn = init_sqlite()
    migrate_from_mysql(conn)
    conn.close()
