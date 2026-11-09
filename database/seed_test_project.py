import sqlite3
import json
import os

db_path = os.path.join(os.path.dirname(__file__), 'clipper.db')
conn = sqlite3.connect(db_path)
c = conn.cursor()

c.execute('SELECT count(*) FROM projects')
count = c.fetchone()[0]

if count == 0:
    c.execute("""
        INSERT INTO projects (
            id, user_id, source_url, title, duration_sec, clip_duration,
            clip_count, language, transcribe_mode, status, progress,
            progress_message, width, height
        ) VALUES (
            1, 1, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'Uji Coba Otomasi Browser OpenClip', 120.0, 30, 1, 'id',
            'api', 'ready', 100, 'Selesai diproses', 1920, 1080
        )
    """)
    c.execute("""
        INSERT INTO clips (
            id, project_id, start_sec, end_sec, preview_start_sec,
            preview_end_sec, viral_score, score_breakdown, reason,
            title, description, hashtags, status, is_favorite, sort_order
        ) VALUES (
            1, 1, 10.0, 40.0, 10.0, 40.0, 94,
            '{"hook": 95, "flow": 92, "value": 90, "trend": 96}',
            'Momen paling menarik dengan hook kuat',
            'Klip Uji Browser 1',
            'Deskripsi klip otomatis untuk pengujian browser',
            '["#openclip", "#automation", "#testing"]',
            'ready', 1, 1
        )
    """)
    clip_edits_style = json.dumps({
        'template': 'hormozi',
        'fontFamily': 'Montserrat',
        'fontSize': 36,
        'textColor': '#FFFFFF',
        'highlightColor': '#FFDD00',
        'background': True,
        'backgroundColor': '#000000',
        'backgroundOpacity': 70,
        'positionY': 75,
        'wordsPerLine': 3,
        'animation': 'karaoke',
        'highlightKeywords': True
    })
    clip_edits_frame = json.dumps({
        'ratio': '9:16',
        'mode': 'social',
        'zoom': 1,
        'offsetX': 0,
        'offsetY': 0,
        'blur': 15,
        'socialProfile': {
            'accountName': '@openclip_ai',
            'accountHandle': 'Content Creator',
            'avatarUrl': '',
            'bgColor': '#111827',
            'textColor': '#FFFFFF',
            'handleColor': '#9CA3AF',
            'accentColor': '#0095F6',
            'headerHeight': 10,
            'footerHeight': 8,
            'footerText': 'Follow for more clips!',
            'showVerifiedBadge': True,
            'verifiedBadgeColor': '#0095F6',
            'showFollowButton': True,
            'cardStyle': 'flat',
            'videoFrameHeight': 66,
            'videoFrameOffsetY': 0,
            'headerPosY': 6,
            'footerPosY': 91,
            'headerBarHeight': 48,
            'footerBarHeight': 34,
            'headerPaddingX': 0,
            'videoHeight': 74
        }
    })
    c.execute("""
        INSERT INTO clip_edits (clip_id, caption_segments, style, frame, audio)
        VALUES (1, '[]', ?, ?, '{"volume":1.0}')
    """, (clip_edits_style, clip_edits_frame))
    c.execute("""
        INSERT INTO transcripts (project_id, language, words)
        VALUES (1, 'id', '[]')
    """)
    conn.commit()
    print("Test project seeded successfully!")
else:
    print(f"Projects already exist (count: {count}).")

conn.close()

