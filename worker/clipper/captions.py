"""Caption: segmentasi dari transkrip, grouping tampilan, dan generator ASS untuk export.

PENTING: logika `build_groups` + rumus ukuran/posisi HARUS identik dengan
web/src/lib/captions.ts agar preview di browser sama dengan hasil burn-in.
"""
from __future__ import annotations

import json
import math
import re
from functools import lru_cache

from . import config

REF_HEIGHT = 1920  # ukuran style dinyatakan dalam px pada tinggi frame 1920

DEFAULT_STYLE: dict = {
    "enabled": True,
    "template": "natural-pure-white",
    "fontFamily": "Inter",
    "fontSize": 76,
    "bold": True,
    "italic": False,
    "underline": False,
    "textAlign": "center",
    "lineHeight": 1.25,
    "uppercase": False,
    "textColor": "#FFFFFF",
    "activeColor": "#FFFFFF",
    "keywordColor": "#F1F5F9",
    "outlineColor": "#000000",
    "outlineWidth": 0,
    "shadow": False,
    "shadowColor": "#000000",
    "shadowDepth": 0,
    "shadowBlur": 4,
    "background": False,
    "backgroundColor": "#000000",
    "backgroundOpacity": 0.8,
    "backgroundCornerRadius": 16,
    "backgroundPaddingX": 20,
    "backgroundPaddingY": 10,
    "positionY": 72,
    "wordsPerLine": 3,
    "wordSpacing": 1.0,
    "letterSpacing": 0.0,
    "animation": "pop",
    "highlightKeywords": False,
}


DEFAULT_FRAME: dict = {
    "ratio": "9:16",
    "mode": "crop",
    "zoom": 1.0,
    "offsetX": 0.0,
    "offsetY": 0.0,
    "blur": 24,
    "fitColor": "#000000",
    "faceTracking": True,
    "trackingMode": "static",
    "speakerShots": [],
    "trackingKeyframes": [],
    "autoZoomCloseUp": False,
    "splitTopOffsetX": -25.0,
    "splitBottomOffsetX": 25.0,
    "splitTopOffsetY": 0.0,
    "splitBottomOffsetY": 0.0,
    "splitTopZoom": 1.0,
    "splitBottomZoom": 1.0,
    "splitRatio": 50,
    "splitDividerWidth": 2,
    "splitDividerColor": "#38BDF8",
    "brightness": 1.0,
    "contrast": 1.0,
    "saturation": 1.0,
    "filterPreset": "none",
    "filterIntensity": 100,
    "videoBlur": 0,
    "vignette": False,
    "cinematicBars": False,
    "cinematicBarsHeight": 12,
    "speed": 1.0,
    "hookTitle": {
        "enabled": False,
        "text": "",
        "bgColor": "#EF4444",
        "textColor": "#FFFFFF",
        "fontSize": 4.5,
        "fontWeight": "bold",
        "textAlign": "center",
        "positionX": 50,
        "positionY": 6,
        "stylePreset": "pill",
        "textCase": "original",
    },
    "progressBar": {
        "enabled": False,
        "color": "#38BDF8",
        "height": 4,
        "position": "bottom",
    },
    "watermark": {
        "enabled": False,
        "text": "",
        "opacity": 0.8,
        "position": "bottom-right",
    },
    "socialProfile": {
        "accountName": "@username",
        "accountHandle": "Content Creator",
        "avatarUrl": "",
        "bgColor": "#FFFFFF",
        "textColor": "#000000",
        "handleColor": "#4B5563",
        "accentColor": "#0095F6",
        "verifiedBadgeColor": "#0095F6",
        "headerHeight": 18,
        "footerHeight": 8,
        "headerGap": 16,
        "footerGap": 16,
        "headerPosY": 6,
        "footerPosY": 91,
        "headerBarHeight": 48,
        "footerBarHeight": 34,
        "headerPaddingX": 0,
        "videoFrameHeight": 66,
        "videoFrameOffsetY": 0,
        "footerText": "Follow for more! 🔥",
        "showVerifiedBadge": True,
        "showFollowButton": False,
        "cardStyle": "flat",
        "videoFrameBg": "#000000",
        "framePadding": 0,
        "frameBorderRadius": 0,
    },
}
DEFAULT_AUDIO: dict = {"volume": 1.0, "muted": False, "vocalBoost": False}

_TERMINAL = re.compile(r"[.!?…]+[\"')\]]*$")
_STOPWORDS = set(
    """yang dan di ke dari ini itu untuk dengan pada adalah juga tidak akan ada saya kamu kita kami mereka dia
    aku gue lu lo kalau kalo jadi tapi atau karena sudah udah bisa lagi aja saja nya sih dong deh kan ya
    the and a an to of in on for with is are was were be been it this that you i we they he she so but or if
    just like really very have has had do does did not no yes""".split()
)


def _clean(w: str) -> str:
    return re.sub(r"[^\w]", "", w.lower(), flags=re.UNICODE)


def build_segments(words: list[dict], start: float, end: float, highlight: bool = True) -> list[dict]:
    """Bagi kata dalam rentang [start, end] menjadi baris caption (segmen)."""
    sel = [w for w in words if w["end"] > start + 0.05 and w["start"] < end - 0.05]
    segments: list[dict] = []
    cur: list[dict] = []

    def flush() -> None:
        if not cur:
            return
        seg_words = [{"w": w["word"], "s": round(w["start"], 3), "e": round(w["end"], 3), "hl": False} for w in cur]
        if highlight:
            cands = [x for x in seg_words if (len(_clean(x["w"])) >= 6 and _clean(x["w"]) not in _STOPWORDS) or _clean(x["w"]).isdigit()]
            if cands:
                max(cands, key=lambda x: (_clean(x["w"]).isdigit(), len(_clean(x["w"]))))["hl"] = True
        segments.append(
            {
                "id": f"s{len(segments) + 1}",
                "start": seg_words[0]["s"],
                "end": seg_words[-1]["e"],
                "text": " ".join(x["w"] for x in seg_words),
                "words": seg_words,
            }
        )
        cur.clear()

    for i, w in enumerate(sel):
        if cur and (w["start"] - cur[-1]["end"] > 0.7):
            flush()
        cur.append(w)
        text = w["word"]
        if _TERMINAL.search(text) or len(cur) >= 7 or (text.endswith(",") and len(cur) >= 4):
            flush()
    flush()
    return segments


def segment_words(seg: dict) -> list[dict]:
    """Kata dari segmen; jika teks diedit tanpa data kata, bagi rata waktunya.
    
    Selalu menormalisasi format kata agar kompatibel baik dengan format Whisper
    ({'word', 'start', 'end'}) maupun format ASS internal ({'w', 's', 'e'}).
    """
    words = seg.get("words") or []
    if words:
        normalized = []
        for w in words:
            word_str = str(w.get("w") or w.get("word") or "")
            start_t = float(w.get("s", w.get("start", 0.0)))
            end_t = float(w.get("e", w.get("end", start_t + 0.3)))
            hl = bool(w.get("hl", False))
            normalized.append({"w": word_str, "s": start_t, "e": end_t, "hl": hl})
        return normalized

    toks = (seg.get("text") or "").split()
    if not toks:
        return []
    s_base = float(seg.get("start", 0.0))
    e_base = float(seg.get("end", s_base + 1.0))
    dur = max(0.05, e_base - s_base)
    step = dur / len(toks)
    return [{"w": t, "s": s_base + i * step, "e": s_base + (i + 1) * step, "hl": False} for i, t in enumerate(toks)]


def build_groups(segments: list[dict], words_per_line: int) -> list[dict]:
    groups: list[dict] = []
    for seg in sorted(segments, key=lambda s: float(s.get("start", 0.0))):
        words = segment_words(seg)
        if not words:
            continue
        chunks = [words] if words_per_line <= 0 else [words[i : i + words_per_line] for i in range(0, len(words), words_per_line)]
        for ch in chunks:
            ch_start = float(ch[0].get("s", ch[0].get("start", 0.0)))
            ch_end = float(ch[-1].get("e", ch[-1].get("end", ch_start + 0.3)))
            groups.append({"start": ch_start, "lastEnd": ch_end, "words": ch})
    for i, g in enumerate(groups):
        nxt = groups[i + 1]["start"] if i + 1 < len(groups) else math.inf
        g["end"] = max(g["start"] + 0.05, min(nxt, g["lastEnd"] + 0.6))
    return groups


# ------------------------------------------------------------------ ASS

@lru_cache(maxsize=1)
def font_metrics() -> dict[str, dict]:
    p = config.FONTS_DIR / "fonts.json"
    try:
        return {f["family"]: f for f in json.loads(p.read_text(encoding="utf-8"))}
    except Exception:
        return {}


def ass_size_factor(family: str) -> float:
    """libass: ukuran = winAscent+winDescent; CSS: ukuran = em. Kembalikan pengali em->ASS."""
    m = font_metrics().get(family)
    if not m:
        return 1.0
    return (m["winAscent"] + m["winDescent"]) / m["unitsPerEm"]


def _ass_color(hex_color: str, alpha: float = 1.0) -> str:
    h = (hex_color or "#FFFFFF").strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    elif len(h) > 6:
        h = h[:6]
    elif len(h) < 6:
        h = h.ljust(6, "F")
    r, g, b = h[0:2], h[2:4], h[4:6]
    a = 255 - int(round(max(0.0, min(1.0, alpha)) * 255))
    return f"&H{a:02X}{b}{g}{r}".upper()


def _inline_color(hex_color: str) -> str:
    h = (hex_color or "#FFFFFF").strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    elif len(h) > 6:
        h = h[:6]
    elif len(h) < 6:
        h = h.ljust(6, "F")
    return f"&H{h[4:6]}{h[2:4]}{h[0:2]}&".upper()


def _ts(t: float) -> str:
    t = max(0.0, t)
    cs = int(round(t * 100))
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _esc(text: str) -> str:
    return text.replace("\\", "/").replace("{", "(").replace("}", ")").replace("\n", " ")


def build_ass(
    segments: list[dict],
    style: dict,
    width: int,
    height: int,
    clip_start: float,
    clip_end: float,
    frame: dict | None = None,
    include_static_overlays: bool = False,
) -> str:
    st = {**DEFAULT_STYLE, **(style or {})}
    fr = {**DEFAULT_FRAME, **(frame or {})}

    speed = max(0.5, min(2.0, float(fr.get("speed", 1.0))))

    k = height / REF_HEIGHT
    family = st["fontFamily"]
    font_px = float(st["fontSize"]) * k
    ass_size = font_px * ass_size_factor(family)
    outline = float(st["outlineWidth"]) * k
    shadow = float(st["shadowDepth"]) * k if st.get("shadow") else 0.0
    margin = int(round(width * 0.05))
    if st.get("background"):
        border_style = 3
        outline_col = _ass_color(st["backgroundColor"], float(st.get("backgroundOpacity", 0.65)))
        outline = font_px * 0.18
        shadow = 0.0
    else:
        border_style = 1
        outline_col = _ass_color(st["outlineColor"], 1.0 if outline > 0 else 0.0)
    back_col = _ass_color(st["shadowColor"], 0.85)
    primary = _ass_color(st["textColor"])
    x = width * float(st.get("positionX", 50.0)) / 100.0
    y = height * float(st["positionY"]) / 100.0

    rot = float(st.get("rotation", 0.0))
    rot_tag = f"\\frz{-rot:.1f}" if rot != 0 else ""
    spacing = max(0, int(round(float(st.get("letterSpacing", 1.0)) * k)))

    # OpenCut Typography parameters
    bold_val = -1 if st.get("bold", True) else 0
    italic_val = -1 if st.get("italic") else 0
    underline_val = -1 if st.get("underline") else 0
    align = str(st.get("textAlign", "center")).lower()
    align_num = 4 if align == "left" else 6 if align == "right" else 5
    align_tag = f"\\an{align_num}"

    style_lines = [
        f"Style: Default,{family},{ass_size:.2f},{primary},&H000000FF,{outline_col},{back_col},{bold_val},{italic_val},{underline_val},0,100,100,{spacing},0,{border_style},{outline:.2f},{shadow:.2f},{align_num},{margin},{margin},0,1"
    ]

    total_clip_dur = max(0.1, (clip_end - clip_start) / speed)
    dialogue_overlays: list[str] = []

    # Hanya tambahkan overlay statis via ASS jika include_static_overlays=True (fallback jika tanpa Pillow PNG overlay)
    if include_static_overlays:
        if fr.get("mode") == "social":
            sp = fr.get("socialProfile", {}) or {}
            vid_h_pct = max(40.0, min(85.0, float(sp.get("videoFrameHeight", 66)))) / 100.0
            vid_h = int(height * vid_h_pct)
            vid_h = vid_h if vid_h % 2 == 0 else vid_h + 1
            vid_offset_y_pct = float(sp.get("videoFrameOffsetY", 0.0)) / 100.0
            vid_y = int((height - vid_h) / 2 + (height * vid_offset_y_pct))
            vid_y = max(0, min(height - vid_h, vid_y))

            k_soc = height / 640.0
            account_name = sp.get("accountName", "").strip()
            text_color = sp.get("textColor", "#000000")

            hdr_bar_h = int(float(sp.get("headerBarHeight", 48)) * k_soc)
            hdr_pad_x = int(float(sp.get("headerPaddingX", 0)) * (width / 360.0))

            if "headerPosY" in sp:
                hdr_y_pct = max(0.0, min(40.0, float(sp.get("headerPosY", 6.0)))) / 100.0
                hdr_center_y = int(height * hdr_y_pct) + int(hdr_bar_h / 2)
            else:
                hdr_gap_px = int(float(sp.get("headerGap", 16)) * k_soc)
                hdr_center_y = vid_y - hdr_gap_px - int(hdr_bar_h / 2)

            if account_name and hdr_center_y > 20:
                sp_fg = _ass_color(text_color, 1.0)
                sp_font_size = 18.0 * (height / 720.0)
                style_lines.append(
                    f"Style: SocialHeader,{family},{sp_font_size:.1f},{sp_fg},&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,4,40,40,0,1"
                )
                dialogue_overlays.append(
                    f"Dialogue: 0,0:00:00.00,{_ts(total_clip_dur)},SocialHeader,,0,0,0,,{{\\an4\\pos({int(width * 0.12 + hdr_pad_x)},{hdr_center_y})}}{_esc(account_name)}"
                )

            footer_text = sp.get("footerText", "").strip()
            ftr_bar_h = int(float(sp.get("footerBarHeight", 34)) * k_soc)

            if "footerPosY" in sp:
                ftr_y_pct = max(55.0, min(98.0, float(sp.get("footerPosY", 91.0)))) / 100.0
                ftr_center_y = int(height * ftr_y_pct) + int(ftr_bar_h / 2)
            else:
                ftr_gap_px = int(float(sp.get("footerGap", 16)) * k_soc)
                ftr_center_y = vid_y + vid_h + ftr_gap_px + int(ftr_bar_h / 2)

            if footer_text and ftr_center_y < (height - 10):
                ftr_fg = _ass_color(text_color, 0.95)
                ftr_font_size = 15.0 * (height / 720.0)
                style_lines.append(
                    f"Style: SocialFooter,{family},{ftr_font_size:.1f},{ftr_fg},&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,30,30,0,1"
                )
                dialogue_overlays.append(
                    f"Dialogue: 0,0:00:00.00,{_ts(total_clip_dur)},SocialFooter,,0,0,0,,{{\\an5\\pos({int(width / 2)},{ftr_center_y})}}{_esc(footer_text)}"
                )

        ht = fr.get("hookTitle", {})
        if ht.get("enabled") and ht.get("text", "").strip():
            raw_text = ht["text"].strip()
            text_case = ht.get("textCase")
            if text_case == "uppercase" or (text_case is None and ht.get("uppercase") is True):
                ht_text = _esc(raw_text.upper())
            elif text_case == "lowercase":
                ht_text = _esc(raw_text.lower())
            elif text_case == "titlecase":
                ht_text = _esc(re.sub(r"(?:^|\s|[-_])\w", lambda m: m.group(0).upper(), raw_text.lower()))
            else:
                ht_text = _esc(raw_text)

            ht_bg = _ass_color(ht.get("bgColor", "#EF4444"), 0.88)
            ht_fg = _ass_color(ht.get("textColor", "#FFFFFF"), 1.0)
            raw_size = float(ht.get("fontSize", 4.5))
            if raw_size > 16.0:
                raw_size = max(1.5, min(14.0, raw_size / 4.5))
            ht_font_size = max(8.0, raw_size * (height / 100.0))
            ht_pos_y = height * float(ht.get("positionY", 6.0)) / 100.0
            ht_pos_x = width * float(ht.get("positionX", 50.0)) / 100.0
            ht_pad = max(3.0, ht_font_size * 0.28)
            style_lines.append(
                f"Style: HookTitle,{family},{ht_font_size:.1f},{ht_fg},&H000000FF,{ht_bg},&H00000000,-1,0,0,0,100,100,1,0,3,{ht_pad:.1f},0,8,30,30,0,1"
            )
            dialogue_overlays.append(
                f"Dialogue: 1,0:00:00.00,{_ts(total_clip_dur)},HookTitle,,0,0,0,,{{\\an8\\pos({ht_pos_x:.0f},{ht_pos_y:.0f})}}{ht_text}"
            )

        wm = fr.get("watermark", {})
        if wm.get("enabled") and wm.get("text", "").strip():
            raw_text = wm["text"].strip()
            prefix = wm.get("prefixIcon", "at")
            if prefix == "at" and not raw_text.startswith("@"):
                raw_text = f"@{raw_text}"
            elif prefix == "verified":
                raw_text = f"✓ {raw_text}"
            elif prefix == "sparkle":
                raw_text = f"✨ {raw_text}"
            elif prefix == "video":
                raw_text = f"🎬 {raw_text}"

            if wm.get("uppercase"):
                raw_text = raw_text.upper()

            wm_text = _esc(raw_text)
            wm_op = float(wm.get("opacity", 0.85))
            text_color = wm.get("textColor", "#FFFFFF")
            wm_fg = _ass_color(text_color, wm_op)
            preset = wm.get("stylePreset", "pill")
            if preset == "marker":
                wm_fg = _ass_color("#0F172A", wm_op)
                wm_bg = _ass_color("#FACC15", max(0.2, wm_op * 0.95))
                border_style = 3
                outline_val = 0
                shadow_val = 0
            elif preset == "minimal":
                wm_bg = _ass_color("#000000", max(0.1, wm_op * 0.9))
                border_style = 1
                outline_val = 2
                shadow_val = 2
            elif preset == "glow":
                wm_bg = _ass_color(text_color, max(0.15, wm_op * 0.8))
                border_style = 1
                outline_val = 2
                shadow_val = 3
            elif preset == "outline":
                wm_bg = _ass_color("#000000", max(0.1, wm_op * 0.3))
                border_style = 1
                outline_val = 2
                shadow_val = 0
            else:
                wm_bg = _ass_color("#000000", max(0.1, wm_op * 0.65))
                border_style = 3
                outline_val = 0
                shadow_val = 0

            wm_font = wm.get("fontFamily") or family
            user_size = float(wm.get("fontSize", 14))
            wm_size = max(12.0, user_size * (height / 720.0))
            wm_pad = max(3.0, wm_size * 0.22)
            wm_pos = wm.get("position", "bottom-right")

            if wm_pos == "custom" or ("positionX" in wm and "positionY" in wm):
                wm_x = int(width * (float(wm.get("positionX", 85)) / 100.0))
                wm_y = int(height * (float(wm.get("positionY", 92)) / 100.0))
                align_val = 5
            else:
                align_map = {
                    "top-left": (7, int(width * 0.05), int(height * 0.04)),
                    "top-right": (9, int(width * 0.95), int(height * 0.04)),
                    "bottom-left": (1, int(width * 0.05), int(height * 0.96)),
                    "bottom-right": (3, int(width * 0.95), int(height * 0.96)),
                }
                align_val, wm_x, wm_y = align_map.get(wm_pos, (3, int(width * 0.95), int(height * 0.96)))

            wm_outline_str = f"{wm_pad:.1f}" if border_style == 3 else f"{outline_val}"
            style_lines.append(
                f"Style: Watermark,{wm_font},{wm_size:.1f},{wm_fg},&H000000FF,{wm_bg},&H00000000,-1,0,0,0,100,100,1,0,{border_style},{wm_outline_str},{shadow_val},{align_val},20,20,0,1"
            )
            dialogue_overlays.append(
                f"Dialogue: 2,0:00:00.00,{_ts(total_clip_dur)},Watermark,,0,0,0,,{{\\an{align_val}\\pos({wm_x:.0f},{wm_y:.0f})}}{wm_text}"
            )

    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "YCbCr Matrix: TV.709",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        *style_lines,
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        *dialogue_overlays,
    ]

    text_c = _inline_color(st["textColor"])
    active_c = _inline_color(st["activeColor"])
    kw_c = _inline_color(st["keywordColor"])
    anim = st.get("animation", "none")
    upper = bool(st.get("uppercase"))
    hl_on = bool(st.get("highlightKeywords", True))
    pos = f"{align_tag}\\pos({x:.0f},{y:.0f}){rot_tag}"

    def word_text(w: dict) -> str:
        t = _esc(w["w"])
        return t.upper() if upper else t

    def render(words: list[dict], active: int | None = None, reveal: int | None = None) -> str:
        parts = []
        for i, w in enumerate(words):
            t = word_text(w)
            if reveal is not None and i > reveal:
                parts.append(f"{{\\alpha&HFF&}}{t}{{\\alpha&H00&}}")
            elif active is not None and i == active:
                parts.append(f"{{\\c{active_c}}}{t}{{\\c{text_c}}}")
            elif hl_on and w.get("hl"):
                parts.append(f"{{\\c{kw_c}}}{t}{{\\c{text_c}}}")
            else:
                parts.append(t)
        return " ".join(parts)

    def emit(start: float, end: float, tags: str, text: str) -> None:
        s = (max(start, clip_start) - clip_start) / speed
        e = (min(end, clip_end) - clip_start) / speed
        if e - s < 0.02:
            return
        lines.append(f"Dialogue: 0,{_ts(s)},{_ts(e)},Default,,0,0,0,,{{{pos}{tags}}}{text}")

    if st.get("enabled", True) is not False:
        for g in build_groups(segments, int(st.get("wordsPerLine", 3))):
            if g["end"] <= clip_start or g["start"] >= clip_end:
                continue
            words = g["words"]
            if anim in ("karaoke", "typewriter"):
                for i, w in enumerate(words):
                    s = g["start"] if i == 0 else float(w["s"])
                    e = float(words[i + 1]["s"]) if i + 1 < len(words) else g["end"]
                    if anim == "karaoke":
                        emit(s, e, "", render(words, active=i))
                    else:
                        emit(s, e, "", render(words, reveal=i))
            elif anim == "pop":
                emit(g["start"], g["end"], "\\fscx80\\fscy80\\t(0,100,\\fscx100\\fscy100)", render(words))
            elif anim == "fade":
                emit(g["start"], g["end"], "\\fad(150,100)", render(words))
            else:
                emit(g["start"], g["end"], "", render(words))
    return "\n".join(lines) + "\n"
