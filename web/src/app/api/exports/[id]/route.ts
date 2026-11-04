import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { ExportRecord } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const exportId = Number(id);
    if (!exportId) {
      return NextResponse.json({ error: 'ID export tidak valid' }, { status: 400 });
    }

    const exp = await queryOne<ExportRecord>('SELECT * FROM exports WHERE id = ?', [exportId]);
    if (!exp) {
      return NextResponse.json({ error: 'Export record tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({ export: exp });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
