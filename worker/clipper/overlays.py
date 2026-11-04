"""Generator overlay visual statis untuk ekspor video (Mode Social, Hook Title, Watermark).

Menggunakan Pillow (PIL) dan TrueType font dari web/public/fonts agar visual
identik 1:1 dengan tampilan React HTML Canvas di dashboard editor:
1. Social Media Profile: Header card (Avatar lingkaran / gambar base64, verified badge,
   account name, account handle, container pill), Video corner radius, dan Footer CTA card.
2. Hook Title / Headline Viral Banner: Banner box di atas dengan warna & font yang disesuaikan.
3. Creator Watermark: Pill branding dengan icon prefix (@, v, sparkle, video) dan style preset.
"""
from __future__ import annotations

import base64
import io
import logging
from pathlib import Path
from typing import Any

from PIL import Image, ImageColor, ImageDraw, ImageFont

from . import config

logger = logging.getLogger(__name__)


def _hex_to_rgba(hex_str: str, alpha: float = 1.0) -> tuple[int, int, int, int]:
    """Konversi hex color (#RGB, #RRGGBB) ke tuple RGBA (0..255)."""
    h = (hex_str or "#000000").strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    elif len(h) > 6:
        h = h[:6]
    elif len(h) < 6:
        h = h.ljust(6, "F")
    try:
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except Exception:
        r, g, b = 255, 255, 255
    a = int(round(max(0.0, min(1.0, alpha)) * 255))
    return (r, g, b, a)


def _get_font(font_family: str, size: int, weight: str = "bold") -> ImageFont.FreeTypeFont:
    """Ambil font TrueType dari direktori fonts atau fallback ke default."""
    fam_lower = (font_family or "inter").lower().strip().replace(" ", "-")
    font_file = None
    if config.FONTS_DIR.exists():
        target_num = "400" if weight in ("normal", "regular", "400") else "500" if weight == "medium" else "800" if weight in ("black", "900") else "700"
        for f in config.FONTS_DIR.glob("*.ttf"):
            stem = f.stem.lower()
            if fam_lower in stem and target_num in stem:
                font_file = f
                break
        if not font_file:
            for f in config.FONTS_DIR.glob("*.ttf"):
                stem = f.stem.lower()
                if fam_lower in stem:
                    font_file = f
                    break
        if not font_file:
            # Fallback ke inter-700.ttf atau font pertama yang tersedia
            default_inter = config.FONTS_DIR / "inter-700.ttf"
            if default_inter.exists():
                font_file = default_inter
            else:
                ttfs = list(config.FONTS_DIR.glob("*.ttf"))
                if ttfs:
                    font_file = ttfs[0]

    if font_file and font_file.exists():
        try:
            return ImageFont.truetype(str(font_file), size=max(8, int(size)))
        except Exception:
            pass

    return ImageFont.load_default()


def generate_static_overlay(frame: dict, target_w: int, target_h: int, output_path: Path) -> bool:
    """Bangun gambar overlay transparan RGBA (PNG) untuk elemen statis.

    Mengembalikan True jika ada elemen visual yang digambar, atau False jika kanvas kosong.
    """
    mode = frame.get("mode", "crop")
    ht = frame.get("hookTitle", {}) or {}
    wm = frame.get("watermark", {}) or {}
    sp = frame.get("socialProfile", {}) or {}

    has_social = mode == "social"
    has_ht = bool(ht.get("enabled") and ht.get("text", "").strip())
    has_wm = bool(wm.get("enabled") and wm.get("text", "").strip())

    if not (has_social or has_ht or has_wm):
        return False

    scale_x = target_w / 360.0
    scale_y = target_h / 640.0

    img = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    has_drawn = False

    # ==============================================================
    # 1. SOCIAL MEDIA PROFILE CARD (HEADER, CORNERS, FOOTER)
    # ==============================================================
    if has_social:
        has_drawn = True
        bg_col = _hex_to_rgba(sp.get("bgColor", "#FFFFFF"), 1.0)
        text_col = _hex_to_rgba(sp.get("textColor", "#000000"), 1.0)
        handle_col = _hex_to_rgba(sp.get("handleColor", "#4B5563"), 1.0)
        accent_col = _hex_to_rgba(sp.get("accentColor", "#000000"), 1.0)

        hdr_pos_y = float(sp.get("headerPosY", 6.0)) / 100.0
        hdr_bar_h = int(float(sp.get("headerBarHeight", 48)) * scale_y)
        hdr_pad_x = int(float(sp.get("headerPaddingX", 0)) * scale_x)
        hdr_top_y = int(target_h * hdr_pos_y)
        hdr_w = target_w - 2 * hdr_pad_x

        b_rad = int(float(sp.get("frameBorderRadius", 0)) * scale_x)

        # A. Header Container Bar
        card_style = sp.get("cardStyle", "flat")
        if card_style == "glass":
            hdr_bg = _hex_to_rgba(sp.get("bgColor", "#FFFFFF"), 0.85)
        elif card_style == "neon":
            hdr_bg = _hex_to_rgba(sp.get("bgColor", "#FFFFFF"), 0.95)
        else:
            hdr_bg = bg_col

        if b_rad > 0:
            draw.rounded_rectangle(
                [hdr_pad_x, hdr_top_y, hdr_pad_x + hdr_w, hdr_top_y + hdr_bar_h],
                radius=min(int(16 * scale_x), b_rad),
                fill=hdr_bg,
            )
        else:
            draw.rectangle(
                [hdr_pad_x, hdr_top_y, hdr_pad_x + hdr_w, hdr_top_y + hdr_bar_h],
                fill=hdr_bg,
            )

        # B. Avatar Lingkaran (Foto Base64 / File / Inisial Akun)
        av_size = int(max(22.0, min(52.0, float(sp.get("headerBarHeight", 48)) - 12.0)) * scale_y)
        av_x = hdr_pad_x + int(14 * scale_x)
        av_y = hdr_top_y + (hdr_bar_h - av_size) // 2

        avatar_url = sp.get("avatarUrl", "").strip()
        avatar_drawn = False

        if avatar_url.startswith("data:image"):
            try:
                _, b64_data = avatar_url.split(",", 1)
                raw_bytes = base64.b64decode(b64_data)
                av_img = Image.open(io.BytesIO(raw_bytes)).convert("RGBA")
                av_img = av_img.resize((av_size, av_size), Image.Resampling.LANCZOS)
                # Anti-aliased circular mask
                mask_res = av_size * 4
                mask = Image.new("L", (mask_res, mask_res), 0)
                ImageDraw.Draw(mask).ellipse([0, 0, mask_res - 1, mask_res - 1], fill=255)
                mask = mask.resize((av_size, av_size), Image.Resampling.LANCZOS)
                img.paste(av_img, (av_x, av_y), mask)
                avatar_drawn = True
            except Exception as e:
                logger.warning("Gagal render avatar base64: %s", e)

        elif avatar_url and Path(avatar_url).exists():
            try:
                av_img = Image.open(avatar_url).convert("RGBA")
                av_img = av_img.resize((av_size, av_size), Image.Resampling.LANCZOS)
                mask_res = av_size * 4
                mask = Image.new("L", (mask_res, mask_res), 0)
                ImageDraw.Draw(mask).ellipse([0, 0, mask_res - 1, mask_res - 1], fill=255)
                mask = mask.resize((av_size, av_size), Image.Resampling.LANCZOS)
                img.paste(av_img, (av_x, av_y), mask)
                avatar_drawn = True
            except Exception as e:
                logger.warning("Gagal render avatar file: %s", e)

        if not avatar_drawn:
            # Fallback avatar: lingkaran aksen dengan inisial nama
            draw.ellipse(
                [av_x, av_y, av_x + av_size, av_y + av_size],
                fill=_hex_to_rgba(sp.get("accentColor", "#000000"), 0.22),
            )
            initial = (sp.get("accountName") or "U").replace("@", "").strip()[:1].upper()
            font_init = _get_font("inter", int(av_size * 0.48))
            draw.text(
                (av_x + av_size // 2, av_y + av_size // 2),
                initial,
                font=font_init,
                fill=accent_col,
                anchor="mm",
            )

        # Border cincin avatar
        border_w = max(2, int(2.2 * scale_y))
        draw.ellipse([av_x, av_y, av_x + av_size, av_y + av_size], outline=accent_col, width=border_w)

        # C. Nama Akun, Verified Badge, dan Handle
        account_name = sp.get("accountName", "@username") or "@username"
        account_handle = sp.get("accountHandle", "Content Creator") or "Content Creator"

        font_name_size = int(max(10.0, min(16.0, float(sp.get("headerBarHeight", 48)) * 0.28)) * scale_y)
        font_handle_size = int(max(8.0, min(13.0, float(sp.get("headerBarHeight", 48)) * 0.23)) * scale_y)
        font_name = _get_font("inter", font_name_size)
        font_handle = _get_font("inter", font_handle_size)

        name_x = av_x + av_size + int(12 * scale_x)
        name_y = hdr_top_y + (hdr_bar_h - (font_name_size + font_handle_size + int(6 * scale_y))) // 2
        draw.text((name_x, name_y), account_name, font=font_name, fill=text_col)

        # Verified Checkmark Badge
        if sp.get("showVerifiedBadge", True):
            name_bbox = draw.textbbox((name_x, name_y), account_name, font=font_name)
            badge_size = int(font_name_size * 0.88)
            badge_x = name_bbox[2] + int(8 * scale_x)
            badge_y = name_y + (font_name_size - badge_size) // 2 + int(1.5 * scale_y)
            draw.ellipse(
                [badge_x, badge_y, badge_x + badge_size, badge_y + badge_size],
                fill=_hex_to_rgba("#3B82F6", 1.0),
            )
            chk_w = max(2, int(2.4 * scale_y))
            p1 = (badge_x + badge_size * 0.28, badge_y + badge_size * 0.52)
            p2 = (badge_x + badge_size * 0.44, badge_y + badge_size * 0.70)
            p3 = (badge_x + badge_size * 0.74, badge_y + badge_size * 0.32)
            draw.line([p1, p2, p3], fill=(255, 255, 255, 255), width=chk_w, joint="curve")

        handle_y = name_y + font_name_size + int(5 * scale_y)
        draw.text((name_x, handle_y), account_handle, font=font_handle, fill=handle_col)

        # D. Footer CTA Container & Text
        footer_text = sp.get("footerText", "").strip()
        if footer_text:
            ftr_pos_y = float(sp.get("footerPosY", 91.0)) / 100.0
            ftr_bar_h = int(float(sp.get("footerBarHeight", 34)) * scale_y)
            ftr_top_y = int(target_h * ftr_pos_y)
            ftr_pad_x = int(float(sp.get("headerPaddingX", 0)) * scale_x)
            ftr_w = target_w - 2 * ftr_pad_x
            if b_rad > 0:
                draw.rounded_rectangle(
                    [ftr_pad_x, ftr_top_y, ftr_pad_x + ftr_w, ftr_top_y + ftr_bar_h],
                    radius=min(int(16 * scale_x), b_rad),
                    fill=bg_col,
                )
            else:
                draw.rectangle(
                    [ftr_pad_x, ftr_top_y, ftr_pad_x + ftr_w, ftr_top_y + ftr_bar_h],
                    fill=bg_col,
                )
            font_ftr_size = int(max(9.0, min(15.0, float(sp.get("footerBarHeight", 34)) * 0.36)) * scale_y)
            font_ftr = _get_font("inter", font_ftr_size)
            draw.text(
                (ftr_pad_x + ftr_w // 2, ftr_top_y + ftr_bar_h // 2),
                footer_text,
                font=font_ftr,
                fill=text_col,
                anchor="mm",
            )

        # E. Video Window Rounded Corners Cutouts
        if b_rad > 2:
            vid_h_pct = max(40.0, min(85.0, float(sp.get("videoFrameHeight", 66)))) / 100.0
            vid_h = int(target_h * vid_h_pct)
            vid_h = vid_h if vid_h % 2 == 0 else vid_h + 1
            vid_offset_y_pct = float(sp.get("videoFrameOffsetY", 0.0)) / 100.0
            vid_y = int((target_h - vid_h) / 2 + (target_h * vid_offset_y_pct))
            vid_y = max(0, min(target_h - vid_h, vid_y))

            pad_px_web = max(0.0, min(50.0, float(sp.get("framePadding", 0))))
            pad_x = int(target_w * (pad_px_web / 360.0))
            inner_w = max(200, target_w - 2 * pad_x)

            # Gambar 4 sudut membulat dengan warna bg_col di atas video
            r = min(b_rad, 60)
            corner_mask = Image.new("RGBA", (r * 2, r * 2), (0, 0, 0, 0))
            c_draw = ImageDraw.Draw(corner_mask)
            c_draw.rectangle([0, 0, r * 2, r * 2], fill=bg_col)
            c_draw.ellipse([0, 0, r * 2 - 1, r * 2 - 1], fill=(0, 0, 0, 0))

            # Top-left corner
            img.paste(corner_mask.crop((0, 0, r, r)), (pad_x, vid_y), corner_mask.crop((0, 0, r, r)))
            # Top-right corner
            img.paste(
                corner_mask.crop((r, 0, r * 2, r)),
                (pad_x + inner_w - r, vid_y),
                corner_mask.crop((r, 0, r * 2, r)),
            )
            # Bottom-left corner
            img.paste(
                corner_mask.crop((0, r, r, r * 2)),
                (pad_x, vid_y + vid_h - r),
                corner_mask.crop((0, r, r, r * 2)),
            )
            # Bottom-right corner
            img.paste(
                corner_mask.crop((r, r, r * 2, r * 2)),
                (pad_x + inner_w - r, vid_y + vid_h - r),
                corner_mask.crop((r, r, r * 2, r * 2)),
            )

    # ==============================================================
    # 2. HOOK TITLE / HEADLINE BANNER (MULTI-STYLE, DRAGGABLE & CUSTOM CASING)
    # ==============================================================
    if has_ht:
        has_drawn = True
        # Format teks sesuai pilihan pengguna: 'original', 'uppercase', 'lowercase', 'titlecase'
        raw_text = ht["text"].strip()
        case_mode = ht.get("textCase")
        is_upper = ht.get("uppercase")
        if case_mode == "uppercase" or (case_mode is None and is_upper is True):
            ht_text = raw_text.upper()
        elif case_mode == "lowercase":
            ht_text = raw_text.lower()
        elif case_mode == "titlecase":
            ht_text = raw_text.title()
        else:
            # Default: teks tampil asli sesuai ketikan (tidak dipaksa huruf besar)
            ht_text = raw_text

        ht_pos_y_pct = float(ht.get("positionY", 6.0)) / 100.0
        ht_top_y = int(target_h * ht_pos_y_pct)
        ht_pos_x_pct = float(ht.get("positionX", 50.0)) / 100.0
        center_x = int(target_w * ht_pos_x_pct)
        ht_preset = ht.get("stylePreset", "pill")
        font_name = ht.get("fontFamily", "montserrat").lower()
        
        # Skalabilitas ukuran font ala OpenCut (relatif terhadap canvas height):
        raw_size = float(ht.get("fontSize", 4.5))
        if raw_size > 16.0:
            # Kompatibilitas mundur dengan rentang lama (14-36)
            raw_size = max(1.5, min(14.0, raw_size / 4.5))
        ht_size = max(8, int(raw_size * (target_h / 100.0)))
        ht_weight = ht.get("fontWeight", "bold")
        ht_font = _get_font(font_name, ht_size, weight=ht_weight)
        ht_fg = _hex_to_rgba(ht.get("textColor", "#FFFFFF"), 1.0)
        ht_bg = _hex_to_rgba(ht.get("bgColor", "#EF4444"), 0.94)

        bbox = draw.textbbox((0, 0), ht_text, font=ht_font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]

        def _calc_box_x(w: int) -> int:
            return max(int(target_w * 0.02), min(target_w - w - int(target_w * 0.02), center_x - (w // 2)))

        if ht_preset == "clean-no-bg":
            # TANPA BACKGROUND: TEKS POLOS BERSIH (CLEAN PUTIH)
            # Tanpa outline/stroke hitam kasar di pinggir font. Teks putih bersih dengan bayangan lembut tipis di bawah.
            center_y = ht_top_y + (text_h // 2)
            soft_shadow_col = (0, 0, 0, 80)
            draw.text((center_x, center_y + max(2, int(2 * scale_y))), ht_text, font=ht_font, fill=soft_shadow_col, anchor="mm")
            draw.text((center_x, center_y), ht_text, font=ht_font, fill=ht_fg, anchor="mm")

        elif ht_preset == "glow-no-bg":
            # TANPA BACKGROUND: Teks dengan efek neon glow bercahaya
            center_y = ht_top_y + (text_h // 2)
            glow_hex = ht.get("bgColor") or "#38BDF8"
            glow_rgba = _hex_to_rgba(glow_hex, 0.45)
            for r_glow in [6, 4, 3, 2, 1]:
                glow_a = max(20, min(140, int(70 / r_glow)))
                g_col = (glow_rgba[0], glow_rgba[1], glow_rgba[2], glow_a)
                for dx, dy in [(-r_glow, 0), (r_glow, 0), (0, -r_glow), (0, r_glow), (-r_glow, -r_glow), (r_glow, r_glow)]:
                    draw.text((center_x + dx, center_y + dy), ht_text, font=ht_font, fill=g_col, anchor="mm")
            draw.text((center_x + 2, center_y + 3), ht_text, font=ht_font, fill=(0, 0, 0, 210), anchor="mm")
            draw.text((center_x, center_y), ht_text, font=ht_font, fill=ht_fg, anchor="mm")

        elif ht_preset == "glass":
            # Frosted liquid glass semi-transparan
            pad_x_box = int(ht_size * 0.8)
            pad_y_box = int(ht_size * 0.35)
            box_w = min(int(target_w * 0.92), text_w + pad_x_box * 2)
            box_h = text_h + pad_y_box * 2
            box_x = _calc_box_x(box_w)
            box_radius = max(8, int(12 * scale_x))
            draw.rounded_rectangle([box_x + 3, ht_top_y + 4, box_x + box_w + 3, ht_top_y + box_h + 4], radius=box_radius, fill=(0, 0, 0, 110))
            draw.rounded_rectangle([box_x, ht_top_y, box_x + box_w, ht_top_y + box_h], radius=box_radius, fill=(255, 255, 255, 38), outline=(255, 255, 255, 85), width=max(1, int(1.5 * scale_x)))
            draw.text((center_x, ht_top_y + box_h // 2), ht_text, font=ht_font, fill=ht_fg, anchor="mm")

        elif ht_preset == "marker":
            # Stabilo highlighter
            pad_x_box = int(ht_size * 0.7)
            pad_y_box = int(ht_size * 0.28)
            box_w = min(int(target_w * 0.92), text_w + pad_x_box * 2)
            box_h = text_h + pad_y_box * 2
            box_x = _calc_box_x(box_w)
            draw.rounded_rectangle([box_x + 2, ht_top_y + 3, box_x + box_w + 2, ht_top_y + box_h + 3], radius=3, fill=(0, 0, 0, 90))
            draw.rounded_rectangle([box_x, ht_top_y, box_x + box_w, ht_top_y + box_h], radius=3, fill=ht_bg)
            draw.text((center_x, ht_top_y + box_h // 2), ht_text, font=ht_font, fill=ht_fg, anchor="mm")

        elif ht_preset == "outline":
            # Stroke outline
            pad_x_box = int(ht_size * 0.75)
            pad_y_box = int(ht_size * 0.3)
            box_w = min(int(target_w * 0.92), text_w + pad_x_box * 2)
            box_h = text_h + pad_y_box * 2
            box_x = _calc_box_x(box_w)
            box_radius = max(6, int(8 * scale_x))
            draw.rounded_rectangle([box_x, ht_top_y, box_x + box_w, ht_top_y + box_h], radius=box_radius, fill=(0, 0, 0, 160), outline=ht_bg, width=max(2, int(2.5 * scale_x)))
            draw.text((center_x, ht_top_y + box_h // 2), ht_text, font=ht_font, fill=ht_fg, anchor="mm")

        elif ht_preset == "luxury":
            # Luxury dark & gold
            pad_x_box = int(ht_size * 0.8)
            pad_y_box = int(ht_size * 0.32)
            box_w = min(int(target_w * 0.92), text_w + pad_x_box * 2)
            box_h = text_h + pad_y_box * 2
            box_x = _calc_box_x(box_w)
            box_radius = max(6, int(8 * scale_x))
            gold_color = (245, 158, 11, 230)
            draw.rounded_rectangle([box_x + 3, ht_top_y + 4, box_x + box_w + 3, ht_top_y + box_h + 4], radius=box_radius, fill=(0, 0, 0, 180))
            draw.rounded_rectangle([box_x, ht_top_y, box_x + box_w, ht_top_y + box_h], radius=box_radius, fill=(15, 23, 42, 240), outline=gold_color, width=max(1, int(1.5 * scale_x)))
            draw.text((center_x, ht_top_y + box_h // 2), ht_text, font=ht_font, fill=ht_fg, anchor="mm")

        elif ht_preset == "badge":
            # Sticker badge with white border
            pad_x_box = int(ht_size * 0.75)
            pad_y_box = int(ht_size * 0.3)
            box_w = min(int(target_w * 0.92), text_w + pad_x_box * 2)
            box_h = text_h + pad_y_box * 2
            box_x = _calc_box_x(box_w)
            box_radius = max(4, int(5 * scale_x))
            draw.rounded_rectangle([box_x + 3, ht_top_y + 4, box_x + box_w + 3, ht_top_y + box_h + 4], radius=box_radius, fill=(0, 0, 0, 140))
            draw.rounded_rectangle([box_x, ht_top_y, box_x + box_w, ht_top_y + box_h], radius=box_radius, fill=ht_bg, outline=(255, 255, 255, 255), width=max(2, int(2.5 * scale_x)))
            draw.text((center_x, ht_top_y + box_h // 2), ht_text, font=ht_font, fill=ht_fg, anchor="mm")

        else:  # "pill" (default)
            pad_x_box = int(ht_size * 0.75)
            pad_y_box = int(ht_size * 0.32)
            box_w = min(int(target_w * 0.92), text_w + pad_x_box * 2)
            box_h = text_h + pad_y_box * 2
            box_x = _calc_box_x(box_w)
            box_radius = max(6, int(10 * scale_x))
            shadow_col = (0, 0, 0, 110)
            draw.rounded_rectangle(
                [box_x + 3, ht_top_y + 4, box_x + box_w + 3, ht_top_y + box_h + 4],
                radius=box_radius,
                fill=shadow_col,
            )
            draw.rounded_rectangle(
                [box_x, ht_top_y, box_x + box_w, ht_top_y + box_h],
                radius=box_radius,
                fill=ht_bg,
                outline=(255, 255, 255, 60),
                width=max(1, int(1.5 * scale_x)),
            )
            draw.text(
                (center_x, ht_top_y + box_h // 2),
                ht_text,
                font=ht_font,
                fill=ht_fg,
                anchor="mm",
            )

    # ==============================================================
    # 3. WATERMARK / CREATOR BRANDING
    # ==============================================================
    if has_wm:
        has_drawn = True
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

        wm_op = float(wm.get("opacity", 0.85))
        text_color_hex = wm.get("textColor", "#FFFFFF")
        wm_fg = _hex_to_rgba(text_color_hex, wm_op)
        preset = wm.get("stylePreset", "pill")

        if preset == "marker":
            wm_fg = _hex_to_rgba("#0F172A", wm_op)
            wm_bg = _hex_to_rgba("#FACC15", max(0.2, wm_op * 0.95))
        elif preset == "glow":
            wm_bg = _hex_to_rgba("#000000", max(0.2, wm_op * 0.65))
        elif preset == "outline":
            wm_bg = _hex_to_rgba("#000000", max(0.1, wm_op * 0.35))
        elif preset == "minimal":
            wm_bg = (0, 0, 0, 0)
        else:  # pill / glass
            wm_bg = _hex_to_rgba("#000000", max(0.15, wm_op * 0.65))

        wm_font_name = wm.get("fontFamily") or "inter"
        wm_font_size = int(max(11.0, float(wm.get("fontSize", 14)) * (target_h / 720.0)))
        font_wm = _get_font(wm_font_name, wm_font_size)

        pad_wm_x = int(wm_font_size * 0.65)
        pad_wm_y = int(wm_font_size * 0.28)

        bbox_wm = draw.textbbox((0, 0), raw_text, font=font_wm)
        wm_w = bbox_wm[2] - bbox_wm[0] + pad_wm_x * 2
        wm_h = bbox_wm[3] - bbox_wm[1] + pad_wm_y * 2

        pos_preset = wm.get("position", "bottom-right")
        if pos_preset == "custom" or ("positionX" in wm and "positionY" in wm):
            center_x = int(target_w * (float(wm.get("positionX", 85)) / 100.0))
            center_y = int(target_h * (float(wm.get("positionY", 92)) / 100.0))
            wm_x = center_x - wm_w // 2
            wm_y = center_y - wm_h // 2
        else:
            if pos_preset == "top-left":
                wm_x = int(target_w * 0.05)
                wm_y = int(target_h * 0.04)
            elif pos_preset == "top-right":
                wm_x = int(target_w * 0.95) - wm_w
                wm_y = int(target_h * 0.04)
            elif pos_preset == "bottom-left":
                wm_x = int(target_w * 0.05)
                wm_y = int(target_h * 0.95) - wm_h
            else:  # bottom-right
                wm_x = int(target_w * 0.95) - wm_w
                wm_y = int(target_h * 0.95) - wm_h

        wm_radius = wm_h // 2
        if wm_bg[3] > 0:
            draw.rounded_rectangle([wm_x, wm_y, wm_x + wm_w, wm_y + wm_h], radius=wm_radius, fill=wm_bg)

        draw.text(
            (wm_x + wm_w // 2, wm_y + wm_h // 2),
            raw_text,
            font=font_wm,
            fill=wm_fg,
            anchor="mm",
        )

    if has_drawn:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(str(output_path), "PNG")
        return True

    return False

