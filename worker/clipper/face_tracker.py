"""Deteksi dan pelacakan posisi wajah (Face Tracking & Smart Auto-Framing) untuk klip 9:16.

Menggunakan model ONNX UltraFace berkecepatan tinggi (~1.2 MB) untuk mendeteksi
posisi wajah pembicara di setiap frame video secara akurat.
Jika wajah berada di kiri atau kanan (misal format podcast 2 orang atau presenter),
sistem otomatis menghitung nilai offset_x agar wajah pembicara tepat berada di tengah kanvas.
"""
from __future__ import annotations

import logging
import math
import os
from pathlib import Path
from typing import Any

import numpy as np

from . import media

logger = logging.getLogger(__name__)

_SESSION = None
_PRIORS = None
_MODEL_PATH: Path | None = None


def get_model_path() -> Path:
    global _MODEL_PATH
    if _MODEL_PATH:
        return _MODEL_PATH
    # Cari di storage/models/face
    base_dir = Path(__file__).resolve().parent.parent.parent
    p = base_dir / "storage" / "models" / "face" / "version-RFB-320.onnx"
    _MODEL_PATH = p
    return p


class _UltraFacePriors:
    def __init__(self, width: int = 320, height: int = 240):
        self.image_width = width
        self.image_height = height
        self.min_boxes = [[10, 16, 24], [32, 48], [64, 96], [128, 192, 256]]
        self.strides = [8, 16, 32, 64]
        self.feature_map_sizes = [
            [math.ceil(height / 8), math.ceil(width / 8)],
            [math.ceil(height / 16), math.ceil(width / 16)],
            [math.ceil(height / 32), math.ceil(width / 32)],
            [math.ceil(height / 64), math.ceil(width / 64)],
        ]
        self.center_variance = 0.1
        self.size_variance = 0.2
        self.priors = self._generate_priors()

    def _generate_priors(self) -> np.ndarray:
        priors = []
        for scale_idx, (f_h, f_w) in enumerate(self.feature_map_sizes):
            for i in range(f_h):
                for j in range(f_w):
                    cx = (j + 0.5) * self.strides[scale_idx] / self.image_width
                    cy = (i + 0.5) * self.strides[scale_idx] / self.image_height
                    for min_box in self.min_boxes[scale_idx]:
                        w = min_box / self.image_width
                        h = min_box / self.image_height
                        priors.append([cx, cy, w, h])
        return np.array(priors, dtype=np.float32)


def _get_inference_session():
    global _SESSION, _PRIORS
    if _SESSION is not None:
        return _SESSION, _PRIORS

    model_p = get_model_path()
    if not model_p.exists() or model_p.stat().st_size < 100000:
        logger.warning("Model UltraFace ONNX tidak ditemukan di %s", model_p)
        return None, None

    try:
        import onnxruntime as ort

        # Matikan verbose logs ort
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        _SESSION = ort.InferenceSession(str(model_p), sess_options=opts, providers=["CPUExecutionProvider"])
        _PRIORS = _UltraFacePriors(320, 240)
        logger.info("UltraFace ONNX Session berhasil diinisialisasi dari %s", model_p)
        return _SESSION, _PRIORS
    except Exception as e:
        logger.error("Gagal memuat onnxruntime session: %s", e)
        return None, None


def _decode_boxes(boxes_logits: np.ndarray, priors: np.ndarray, center_var=0.1, size_var=0.2) -> np.ndarray:
    cxcy = boxes_logits[:, :2] * center_var * priors[:, 2:] + priors[:, :2]
    wh = np.exp(boxes_logits[:, 2:] * size_var) * priors[:, 2:]
    xmin_ymin = cxcy - wh / 2.0
    xmax_ymax = cxcy + wh / 2.0
    return np.concatenate([xmin_ymin, xmax_ymax], axis=-1)


def _apply_nms(boxes: np.ndarray, scores: np.ndarray, iou_thresh: float = 0.40) -> list[int]:
    """Non-Maximum Suppression (NMS) standar untuk membuang deteksi duplikat."""
    if len(boxes) == 0:
        return []
    x1 = boxes[:, 0]
    y1 = boxes[:, 1]
    x2 = boxes[:, 2]
    y2 = boxes[:, 3]
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]
    keep: list[int] = []
    while order.size > 0:
        i = int(order[0])
        keep.append(i)
        if order.size == 1:
            break
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        w = np.maximum(0.0, xx2 - xx1)
        h = np.maximum(0.0, yy2 - yy1)
        inter = w * h
        union = areas[i] + areas[order[1:]] - inter
        ovr = np.where(union > 0, inter / union, 0.0)
        inds = np.where(ovr <= iou_thresh)[0]
        order = order[inds + 1]
    return keep


def compute_centering_offset_x(face_center_x: float, v_width: int, v_height: int) -> float:
    """Hitung nilai offset_x (-50.0 s/d +50.0) agar posisi wajah face_center_x tepat di tengah kanvas 9:16.
    
    Formula geometri presisi:
    - w_crop_ratio = (9/16) / (v_width / v_height)
    - crop_left = max(0, min(max_travel, fx - half_crop))
    - crop_pct = (crop_left / max_travel) * 100.0
    - offset_x = crop_pct - 50.0
    Hasilnya menjamin wajah tepat 100% di tengah kanvas (center: 50%) baik di Web Canvas maupun FFmpeg Export!
    """
    if v_height <= 0 or v_width <= 0:
        return 0.0
    v_aspect = v_width / float(v_height)
    target_aspect = 9.0 / 16.0
    if v_aspect <= target_aspect:
        return 0.0

    w_crop_ratio = target_aspect / v_aspect
    half_crop = w_crop_ratio / 2.0
    max_travel = 1.0 - w_crop_ratio

    if max_travel <= 0.001:
        return 0.0

    fx = max(0.0, min(1.0, face_center_x / float(v_width)))
    crop_left = max(0.0, min(max_travel, fx - half_crop))
    crop_pct = (crop_left / max_travel) * 100.0
    offset_x = crop_pct - 50.0
    return round(float(max(-50.0, min(50.0, offset_x))), 1)


def _extract_mouth_patch(img_rgb: np.ndarray, box: list[float], target_size: int = 32) -> np.ndarray:
    """Ekstrak area mulut/dagu pembicara dalam grayscale 32x32 untuk mengukur aktivitas bicara."""
    x1, y1, x2, y2 = [int(v) for v in box]
    h, w = img_rgb.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    bw = x2 - x1
    bh = y2 - y1
    if bw < 10 or bh < 10:
        return np.zeros((target_size, target_size), dtype=np.float32)

    my1 = min(h - 1, int(y1 + 0.60 * bh))
    my2 = min(h, int(y1 + 0.95 * bh))
    mx1 = max(0, int(x1 + 0.20 * bw))
    mx2 = min(w, int(x1 + 0.80 * bw))
    if my2 <= my1 or mx2 <= mx1:
        return np.zeros((target_size, target_size), dtype=np.float32)

    crop = img_rgb[my1:my2, mx1:mx2]
    gray = 0.299 * crop[:, :, 0] + 0.587 * crop[:, :, 1] + 0.114 * crop[:, :, 2]
    gh, gw = gray.shape
    y_idx = np.linspace(0, gh - 1, target_size).astype(int)
    x_idx = np.linspace(0, gw - 1, target_size).astype(int)
    return gray[y_idx[:, None], x_idx].astype(np.float32)


def detect_faces(img_rgb: np.ndarray, conf_thresh: float = 0.55) -> list[dict[str, Any]]:
    """Deteksi wajah pada numpy array RGB (H, W, 3) dengan NMS dan filter artefak / watermark sudut."""
    session, priors_cfg = _get_inference_session()
    h_orig, w_orig = img_rgb.shape[:2]

    if session is None or priors_cfg is None:
        # Fallback offline jika model ONNX belum tersedia
        return _detect_faces_heuristic(img_rgb)

    # Resize gambar ke 320x240
    y_idx = np.linspace(0, h_orig - 1, 240).astype(int)
    x_idx = np.linspace(0, w_orig - 1, 320).astype(int)
    resized = img_rgb[y_idx[:, None], x_idx]

    inp = ((resized.astype(np.float32) - 127.0) / 128.0).transpose(2, 0, 1)
    inp = np.expand_dims(inp, axis=0)

    try:
        scores, boxes_logits = session.run(["scores", "boxes"], {"input": inp})
        scores = scores[0]
        boxes_logits = boxes_logits[0]

        decoded = _decode_boxes(boxes_logits, priors_cfg.priors, priors_cfg.center_variance, priors_cfg.size_variance)

        # Softmax untuk face probability
        exp_scores = np.exp(scores - np.max(scores, axis=-1, keepdims=True))
        probs = exp_scores / np.sum(exp_scores, axis=-1, keepdims=True)
        face_probs = probs[:, 1]

        mask = face_probs > conf_thresh
        raw_boxes = decoded[mask]
        raw_scores = face_probs[mask]

        if len(raw_boxes) == 0:
            return []

        # Konversi ke koordinat piksel asli
        px_boxes = np.zeros_like(raw_boxes)
        px_boxes[:, 0] = np.maximum(0.0, raw_boxes[:, 0] * w_orig)
        px_boxes[:, 1] = np.maximum(0.0, raw_boxes[:, 1] * h_orig)
        px_boxes[:, 2] = np.minimum(float(w_orig), raw_boxes[:, 2] * w_orig)
        px_boxes[:, 3] = np.minimum(float(h_orig), raw_boxes[:, 3] * h_orig)

        # 1. Non-Maximum Suppression (NMS) untuk hapus bounding boxes bertumpuk
        keep_indices = _apply_nms(px_boxes, raw_scores, iou_thresh=0.40)

        results = []
        min_dim = max(30.0, min(w_orig, h_orig) * 0.030)
        min_area = max(4000.0, (w_orig * h_orig) * 0.003)

        for idx in keep_indices:
            x1, y1, x2, y2 = px_boxes[idx]
            s = float(raw_scores[idx])
            bw = x2 - x1
            bh = y2 - y1
            area = bw * bh
            cx = (x1 + x2) / 2.0
            cy = (y1 + y2) / 2.0

            # Filter dimensi minimum (bukan wajah manusia jika terlalu kecil)
            if bw < min_dim or bh < min_dim or area < min_area:
                continue

            # Filter logo/watermark statis di sudut ekstrem (X < 7% atau X > 93%) jika ukurannya relatif kecil
            is_extreme_corner = (cx < 0.07 * w_orig or cx > 0.93 * w_orig)
            if is_extreme_corner and area < (w_orig * h_orig * 0.012):
                continue

            results.append({
                "box": [float(x1), float(y1), float(x2), float(y2)],
                "score": s,
                "center_x": float(cx),
                "center_y": float(cy),
                "width": float(bw),
                "height": float(bh),
                "area": float(area),
            })
        return results
    except Exception as e:
        logger.warning("Inference deteksi wajah gagal: %s. Menggunakan heuristik.", e)
        return _detect_faces_heuristic(img_rgb)


def _detect_faces_heuristic(img_rgb: np.ndarray) -> list[dict[str, Any]]:
    """Heuristik deteksi konsentrasi visual & warna kulit untuk fallback tanpa model."""
    h, w = img_rgb.shape[:2]
    # Sederhana: estimasi warna kulit pada rentang RGB (R > 95, G > 40, B > 20, R > G, R > B)
    r = img_rgb[:, :, 0].astype(int)
    g = img_rgb[:, :, 1].astype(int)
    b = img_rgb[:, :, 2].astype(int)
    skin_mask = (r > 95) & (g > 40) & (b > 20) & (r > g) & (r > b) & (np.abs(r - g) > 15)

    y_indices, x_indices = np.where(skin_mask)
    if len(x_indices) > 500:
        mean_x = float(np.median(x_indices))
        mean_y = float(np.median(y_indices))
        return [{
            "box": [max(0.0, mean_x - 50), max(0.0, mean_y - 50), min(float(w), mean_x + 50), min(float(h), mean_y + 50)],
            "score": 0.5,
            "center_x": mean_x,
            "center_y": mean_y,
            "area": 10000.0,
        }]
    return []


def _cluster_face_positions(
    detected_face_instances: list[dict[str, Any]],
    v_width: int,
    cluster_dist_pct: float = 0.12,
) -> list[dict[str, Any]]:
    """Mengelompokkan deteksi wajah menjadi cluster posisi tempat duduk pembicara (1D horizontal).
    
    Menangani video podcast dengan 2, 3, 4, hingga 5 pembicara secara presisi.
    Mencegah bug kamera mengarah ke tengah meja kosong di antara 2 pembicara.
    """
    if not detected_face_instances:
        return []

    # Sort berdasarkan center_x
    sorted_faces = sorted(detected_face_instances, key=lambda f: f["center_x"])
    dist_threshold = v_width * cluster_dist_pct

    clusters: list[list[dict[str, Any]]] = []
    for face in sorted_faces:
        if not clusters:
            clusters.append([face])
            continue

        last_cluster = clusters[-1]
        cluster_avg_x = sum(f["center_x"] for f in last_cluster) / len(last_cluster)
        if abs(face["center_x"] - cluster_avg_x) <= dist_threshold:
            last_cluster.append(face)
        else:
            clusters.append([face])

    results = []
    for group in clusters:
        xs = [f["center_x"] for f in group]
        ys = [f["center_y"] for f in group]
        med_x = float(np.median(xs))
        med_y = float(np.median(ys))
        avg_score = float(np.mean([f["score"] for f in group]))
        avg_area = float(np.mean([f["area"] for f in group]))
        total_weight = float(sum(f["area"] * (f["score"] ** 2) for f in group))

        results.append({
            "count": len(group),
            "med_x": med_x,
            "med_y": med_y,
            "avg_score": avg_score,
            "avg_area": avg_area,
            "total_weight": total_weight,
        })

    # Urutkan cluster dari kiri ke kanan
    results.sort(key=lambda c: c["med_x"])
    return results


def _decimate_keyframes(kfs: list[dict[str, Any]], max_kfs: int = 45) -> list[dict[str, Any]]:
    """Sederhanakan keyframe kamera agar tetap presisi tanpa melampaui batas stack parser ekspresi FFmpeg."""
    if len(kfs) <= max_kfs:
        return kfs

    selected_indices = {0, len(kfs) - 1}
    scores = []
    for i in range(1, len(kfs) - 1):
        delta_prev = abs(kfs[i]["offsetX"] - kfs[i - 1]["offsetX"])
        delta_next = abs(kfs[i + 1]["offsetX"] - kfs[i]["offsetX"])
        score = delta_prev + delta_next
        scores.append((score, i))

    scores.sort(key=lambda x: x[0], reverse=True)
    for _, idx in scores[: max_kfs - 2]:
        selected_indices.add(idx)

    sorted_indices = sorted(selected_indices)
    return [kfs[i] for i in sorted_indices]


def analyze_clip_faces(
    video_path: Path | str,
    start_sec: float,
    end_sec: float,
    sample_interval: float = 0.4,
    caption_segments: list[dict] | None = None,
) -> dict[str, Any]:
    """Analisis posisi wajah pembicara di rentang waktu klip dengan dukungan Multi-Speaker.
    
    Mendukung format podcast multi-person (2, 3, 4, 5 orang) dengan 1D spatial clustering.
    Mendukung Active Speaker Multi-Cam Auto-Switching dan Dynamic Motion Tracking (Smooth Follow).
    Secara cerdas mengunci wajah pembicara aktif dan MENCEGAH kamera crop jatuh ke tengah
    meja kosong di antara para pembicara.
    """
    video_p = Path(video_path)
    clip_dur = max(0.1, end_sec - start_sec)
    if not video_p.exists():
        return {
            "has_face": False,
            "offset_x": 0.0,
            "offset_y": 0.0,
            "confidence": 0.0,
            "detected_speakers": [],
            "is_multi_speaker": False,
            "tracking_mode": "static",
            "speaker_shots": [],
            "tracking_keyframes": [],
            "suggested_zoom": 1.0,
        }

    try:
        import av
    except ImportError:
        logger.warning("PyAV tidak ditemukan, tracking wajah menggunakan center.")
        return {
            "has_face": False,
            "offset_x": 0.0,
            "offset_y": 0.0,
            "confidence": 0.0,
            "detected_speakers": [],
            "is_multi_speaker": False,
            "tracking_mode": "static",
            "speaker_shots": [],
            "tracking_keyframes": [],
            "suggested_zoom": 1.0,
        }

    # Deteksi rotasi display dari video sumber (metadata rotate / displaymatrix smartphone)
    rot_deg = 0
    try:
        pr = media.probe(video_p)
        rot_deg = int(pr.get("rotate") or 0) % 360
    except Exception:
        pass

    try:
        container = av.open(str(video_p))
        stream = container.streams.video[0]
        v_width = stream.width
        v_height = stream.height
        time_base = float(stream.time_base)
        fps = float(stream.average_rate or 30.0)

        # Jika rotasi video 90 atau 270 derajat, tukar lebar & tinggi agar sesuai tampilan layar
        if rot_deg in (90, 270):
            v_width, v_height = v_height, v_width

        all_face_samples: list[dict[str, Any]] = []
        frames_timeline: dict[float, list[dict[str, Any]]] = {}
        last_sample_t = start_sec - sample_interval

        # Seek ke dekat start_sec untuk efisiensi
        try:
            target_pts = int(max(0.0, start_sec - 1.0) / time_base)
            container.seek(target_pts, stream=stream)
        except Exception:
            pass

        frame_idx = 0
        for frame in container.decode(stream):
            frame_idx += 1
            if frame.time is not None:
                pts_sec = float(frame.time)
            elif frame.pts is not None:
                pts_sec = float(frame.pts * time_base)
            else:
                pts_sec = float(frame_idx / fps)

            if pts_sec < start_sec:
                continue
            if pts_sec > end_sec:
                break

            if pts_sec - last_sample_t >= sample_interval:
                last_sample_t = pts_sec
                arr = frame.to_ndarray(format="rgb24")
                if rot_deg == 90:
                    arr = np.ascontiguousarray(np.rot90(arr, 3))
                elif rot_deg == 180:
                    arr = np.ascontiguousarray(np.rot90(arr, 2))
                elif rot_deg == 270:
                    arr = np.ascontiguousarray(np.rot90(arr, 1))

                faces = detect_faces(arr, conf_thresh=0.55)
                if faces:
                    # Simpan mouth patch untuk analisis pergerakan bicara
                    for f in faces:
                        f["mouth_patch"] = _extract_mouth_patch(arr, f["box"])
                    frames_timeline[pts_sec] = faces
                    for f in faces:
                        all_face_samples.append({
                            "center_x": f["center_x"],
                            "center_y": f["center_y"],
                            "width": f.get("width", 0),
                            "height": f.get("height", 0),
                            "area": f["area"],
                            "score": f["score"],
                            "pts": pts_sec,
                        })

        container.close()

        if not all_face_samples:
            logger.info("FaceTracker: Tidak ada wajah terdeteksi pada [%.1f - %.1f]s. Default center crop.", start_sec, end_sec)
            return {
                "has_face": False,
                "offset_x": 0.0,
                "offset_y": 0.0,
                "confidence": 0.0,
                "detected_speakers": [],
                "is_multi_speaker": False,
                "tracking_mode": "static",
                "speaker_shots": [],
                "tracking_keyframes": [],
                "suggested_zoom": 1.0,
            }

        # 1D Spatial Clustering untuk membedakan kursi/posisi tiap pembicara
        clusters = _cluster_face_positions(all_face_samples, v_width, cluster_dist_pct=0.12)
        if not clusters:
            return {
                "has_face": False,
                "offset_x": 0.0,
                "offset_y": 0.0,
                "confidence": 0.0,
                "detected_speakers": [],
                "is_multi_speaker": False,
                "tracking_mode": "static",
                "speaker_shots": [],
                "tracking_keyframes": [],
                "suggested_zoom": 1.0,
            }

        # Tentukan pembicara primer (dominan) berdasarkan total aktivitas & bobot visual
        primary_cluster = max(clusters, key=lambda c: c["total_weight"])

        # Filter noise & watermark palsu:
        # Cluster kedua HANYA diakui jika terbukti wajah manusia nyata (ukuran & frekuensi signifikan)
        valid_clusters = []
        for c in clusters:
            if c == primary_cluster:
                valid_clusters.append(c)
            elif (
                c["count"] >= max(2, int(0.10 * primary_cluster["count"]))
                and c["avg_area"] >= 0.18 * primary_cluster["avg_area"]
                and c["total_weight"] >= 0.02 * primary_cluster["total_weight"]
                and abs(c["med_x"] - primary_cluster["med_x"]) >= 0.10 * v_width
            ):
                valid_clusters.append(c)

        valid_clusters.sort(key=lambda c: c["med_x"])

        # ═══ ELIMINASI CLUSTER TENGAH PALSU (SOLO CLOSE-UP FILTER) ═══
        # Pada wawancara / podcast 2 orang, seringkali kameramen mengambil shot close-up saat salah satu orang
        # berbicara di mana wajahnya diletakkan di tengah layar (med_x ~45-55%), lalu berpindah ke wide shot
        # yang menampilkan kedua orang duduk di kiri & kanan.
        # Cluster tengah ini BUKAN orang ketiga! Jika dipaksa menjadi pembicara, kamera di wide shot akan meng-crop
        # ruang/meja kosong di tengah antara kedua orang tersebut.
        # Solusi: Jika ada 2 cluster (kiri & kanan) yang sering hadir bersamaan di wide shot (co-occurrence >= 3),
        # dan cluster tengah hampir tidak pernah hadir bersamaan dengan keduanya, maka cluster tengah dieliminasi.
        if len(valid_clusters) >= 3:
            dist_c = v_width * 0.14
            n_cl = len(valid_clusters)
            co_occur = np.zeros((n_cl, n_cl), dtype=int)
            for flist in frames_timeline.values():
                if len(flist) < 2:
                    continue
                matched = set()
                for f in flist:
                    for ci, cl in enumerate(valid_clusters):
                        if abs(f["center_x"] - cl["med_x"]) <= dist_c:
                            matched.add(ci)
                mlist = list(matched)
                for i in range(len(mlist)):
                    for j in range(i + 1, len(mlist)):
                        co_occur[mlist[i], mlist[j]] += 1
                        co_occur[mlist[j], mlist[i]] += 1

            filtered_clusters = []
            for mid_idx in range(n_cl):
                cl_mid = valid_clusters[mid_idx]
                is_fake_mid = False
                for l_idx in range(mid_idx):
                    for r_idx in range(mid_idx + 1, n_cl):
                        if co_occur[l_idx, r_idx] >= 3 and co_occur[mid_idx, r_idx] <= 2 and co_occur[mid_idx, l_idx] <= 2:
                            is_fake_mid = True
                            break
                    if is_fake_mid:
                        break
                if not is_fake_mid:
                    filtered_clusters.append(cl_mid)
                else:
                    logger.info("FaceTracker: Eliminasi false middle cluster (cx=%.2f) yang merupakan shot close-up, bukan orang ketiga.", cl_mid["med_x"] / v_width)

            if len(filtered_clusters) >= 2:
                valid_clusters = filtered_clusters

        is_multi_speaker = (len(valid_clusters) >= 2)

        # Update primary_cluster jika cluster lama tereliminasi
        if primary_cluster not in valid_clusters:
            primary_cluster = max(valid_clusters, key=lambda c: c["total_weight"])

        # Anti-Empty-Center Gate:
        # Jika video menampilkan 2 pembicara (kiri & kanan), kamera DILARANG KERAS mengambil tengah-tengah (0%)
        if is_multi_speaker and len(valid_clusters) == 2:
            off0 = compute_centering_offset_x(valid_clusters[0]["med_x"], v_width, v_height)
            off1 = compute_centering_offset_x(valid_clusters[1]["med_x"], v_width, v_height)
            if abs(off0 - off1) > 16.0:
                # Pastikan primary_cluster mengunci salah satu wajah pembicara nyata
                if abs(compute_centering_offset_x(primary_cluster["med_x"], v_width, v_height)) < 8.0:
                    primary_cluster = valid_clusters[0] if valid_clusters[0]["total_weight"] >= valid_clusters[1]["total_weight"] else valid_clusters[1]

        # SUSUN DAFTAR PEMBICARA TERDETEKSI (Multi-Speaker Seats)
        detected_speakers = []
        n_spk = len(valid_clusters)
        for i, c in enumerate(valid_clusters):
            c_off_pct = compute_centering_offset_x(c["med_x"], v_width, v_height)

            if n_spk == 2:
                lbl = "Pembicara Kiri" if i == 0 else "Pembicara Kanan"
            elif n_spk == 3:
                lbl = ["Pembicara Kiri", "Pembicara Tengah", "Pembicara Kanan"][i]
            elif n_spk == 4:
                lbl = ["Kiri Jauh", "Kiri", "Kanan", "Kanan Jauh"][i]
            else:
                lbl = f"Pembicara {i + 1}"

            detected_speakers.append({
                "id": i + 1,
                "label": lbl,
                "offset_x": c_off_pct,
                "center_x_pct": round(float((c["med_x"] / v_width) * 100.0), 1),
                "weight": round(float(c["total_weight"]), 1),
                "count": c["count"],
                "is_primary": (c == primary_cluster),
            })

        # Pembicara terpilih untuk posisi statis dasar
        chosen_cluster = primary_cluster
        med_x = chosen_cluster["med_x"]
        med_y = chosen_cluster["med_y"]
        avg_conf = chosen_cluster["avg_score"]

        # Hitung offset presisi 9:16
        offset_x_pct = compute_centering_offset_x(med_x, v_width, v_height)

        # Anti-Empty-Center Gate Final:
        # Jika ada 2 pembicara terdeteksi, offset_x_pct WAJIB mengunci salah satu wajah, bukan tengah
        if is_multi_speaker and len(detected_speakers) == 2:
            if abs(offset_x_pct) < 8.0:
                prim_spk = next((s for s in detected_speakers if s.get("is_primary")), detected_speakers[0])
                offset_x_pct = prim_spk["offset_x"]

        # Ruang kepala vertikal (Headroom Y)
        v_center_y = v_height / 2.0
        shift_y = med_y - v_center_y
        offset_y_pct = max(-20.0, min(20.0, (shift_y / v_height) * 25.0))

        speaker_side = "center"
        if offset_x_pct < -8.0:
            speaker_side = "left"
        elif offset_x_pct > 8.0:
            speaker_side = "right"

        # ═══ TIME-SERIES TRAJECTORY & SMOOTH MOTION TRACKING ═══
        # Menghitung posisi horizontal per frame dengan Zero-Phase Bidirectional Smoothing + Instant Cut
        # ATURAN UTAMA: Jika frame memiliki 2 orang atau lebih (podcast/interview):
        # HANYA ambil dan kunci SATU orang yang wajahnya PALING TERLIHAT / DOMINAN
        # (prominence = area * score^2).
        # JANGAN PERNAH crop ke tengah-tengah atau ruang kosong di antara kedua orang!
        # Dan jika fokus berpindah dari satu orang ke orang lain (lompatan > 18%),
        # kamera melakukan INSTANT CUT (bukan perlahan bergeser melintasi ruang kosong).
        sorted_times = sorted(frames_timeline.keys())
        raw_samples: list[tuple[float, float]] = []
        for pts in sorted_times:
            faces_at_t = frames_timeline.get(pts, [])
            if not faces_at_t:
                continue
            best_face = max(faces_at_t, key=lambda f: float(f["area"]) * (float(f["score"]) ** 2))
            raw_x = compute_centering_offset_x(best_face["center_x"], v_width, v_height)
            rel_t = max(0.0, pts - start_sec)
            raw_samples.append((rel_t, raw_x))

        tracking_keyframes: list[dict[str, Any]] = []

        if raw_samples:
            # 1. Pisahkan menjadi rentang shot berkelanjutan berdasarkan deteksi cut (lompatan > 18.0%)
            shots: list[list[tuple[float, float]]] = []
            curr_shot: list[tuple[float, float]] = [raw_samples[0]]
            for i in range(1, len(raw_samples)):
                t_prev, x_prev = curr_shot[-1]
                t_cur, x_cur = raw_samples[i]
                if abs(x_cur - x_prev) > 18.0:
                    shots.append(curr_shot)
                    curr_shot = [raw_samples[i]]
                else:
                    curr_shot.append(raw_samples[i])
            if curr_shot:
                shots.append(curr_shot)

            # 2. Terapkan Zero-Phase Bidirectional Smoothing pada tiap shot
            for shot in shots:
                m = len(shot)
                if m == 1:
                    smoothed_shot = [(shot[0][0], shot[0][1])]
                else:
                    # Forward pass dengan adaptive weighting
                    fwd = [shot[0][1]]
                    for k in range(1, m):
                        x_k = shot[k][1]
                        prev_y = fwd[-1]
                        delta = abs(x_k - prev_y)
                        w = min(1.0, max(0.0, delta / 4.0))
                        alpha_k = 0.18 + 0.32 * w
                        fwd.append(alpha_k * x_k + (1.0 - alpha_k) * prev_y)

                    # Backward pass untuk mengeliminasi lag / fase jeda (Zero Phase Filter)
                    bwd = [0.0] * m
                    bwd[-1] = fwd[-1]
                    for k in range(m - 2, -1, -1):
                        y_k = fwd[k]
                        next_z = bwd[k + 1]
                        delta = abs(y_k - next_z)
                        w = min(1.0, max(0.0, delta / 4.0))
                        alpha_k = 0.18 + 0.32 * w
                        bwd[k] = alpha_k * y_k + (1.0 - alpha_k) * next_z

                    smoothed_shot = [(shot[k][0], bwd[k]) for k in range(m)]

                for t_val, x_val in smoothed_shot:
                    tracking_keyframes.append({
                        "time": round(t_val, 2),
                        "offsetX": round(float(x_val), 1),
                        "offsetY": round(float(offset_y_pct), 1),
                    })

            # Anti-Empty-Center Gate:
            # Jika 2 pembicara berada di samping, pastikan tidak ada keyframe yang jatuh ke tengah kosong (|offsetX| < 8%)
            if is_multi_speaker and len(valid_clusters) == 2:
                prim_off = compute_centering_offset_x(primary_cluster["med_x"], v_width, v_height)
                for kf in tracking_keyframes:
                    if abs(kf["offsetX"]) < 8.0:
                        kf["offsetX"] = round(float(prim_off), 1)

        # Pastikan ada keyframe di t=0 dan t=clip_dur
        if tracking_keyframes and tracking_keyframes[0]["time"] > 0.05:
            tracking_keyframes.insert(0, {
                "time": 0.0,
                "offsetX": tracking_keyframes[0]["offsetX"],
                "offsetY": tracking_keyframes[0]["offsetY"],
            })
        if tracking_keyframes and tracking_keyframes[-1]["time"] < clip_dur - 0.2:
            tracking_keyframes.append({
                "time": round(clip_dur, 2),
                "offsetX": tracking_keyframes[-1]["offsetX"],
                "offsetY": tracking_keyframes[-1]["offsetY"],
            })

        # Sederhanakan keyframe agar tidak membebani filtergraph FFmpeg & aman dari batas stack
        if tracking_keyframes:
            tracking_keyframes = _decimate_keyframes(tracking_keyframes, max_kfs=45)

        # Cek pergerakan kamera (apakah presenter berjalan?)
        x_vals = [kf["offsetX"] for kf in tracking_keyframes] if tracking_keyframes else [offset_x_pct]
        motion_span = max(x_vals) - min(x_vals) if x_vals else 0.0
        is_moving_presenter = motion_span >= 9.0 and not is_multi_speaker

        # ═══ ACTIVE SPEAKER AUTO-SWITCHING (MULTI-CAM CUT) ═══
        # Menghubungkan transkrip/jeda bicara dengan pembicara yang aktif (mendukung 2, 3, 4+ pembicara)
        speaker_shots: list[dict[str, Any]] = []
        if is_multi_speaker and len(detected_speakers) >= 2:
            dist_thresh = v_width * 0.16

            # Susun jendela evaluasi waktu (dari subtitle atau irisan seragam 3.5s)
            time_windows: list[tuple[float, float]] = []
            if caption_segments and len(caption_segments) > 0:
                cur_win_start = None
                cur_win_end = None
                for seg in caption_segments:
                    s_rel = max(0.0, float(seg.get("start", start_sec)) - start_sec)
                    e_rel = min(clip_dur, float(seg.get("end", end_sec)) - start_sec)
                    if e_rel <= s_rel:
                        continue
                    if cur_win_start is None:
                        cur_win_start, cur_win_end = s_rel, e_rel
                    elif (e_rel - cur_win_start < 2.5) and (s_rel - cur_win_end < 0.4):
                        cur_win_end = e_rel
                    else:
                        time_windows.append((cur_win_start, cur_win_end))
                        cur_win_start, cur_win_end = s_rel, e_rel
                if cur_win_start is not None and cur_win_end is not None:
                    time_windows.append((cur_win_start, cur_win_end))
            else:
                step_dur = 3.5
                t_cur = 0.0
                while t_cur < clip_dur:
                    time_windows.append((t_cur, min(clip_dur, t_cur + step_dur)))
                    t_cur += step_dur

            raw_shots: list[dict[str, Any]] = []
            curr_shot_start = 0.0
            curr_spk = next((s for s in detected_speakers if s.get("is_primary")), detected_speakers[0])

            for (s_rel, e_rel) in time_windows:
                # Evaluasi skor kehadiran & aktivitas visual SEMUA pembicara di jendela ini
                speaker_scores: dict[int, float] = {}
                for spk in detected_speakers:
                    spk_cx = (spk["center_x_pct"] * v_width) / 100.0
                    presence_count = 0
                    prominence_sum = 0.0
                    mouth_diff_sum = 0.0
                    prev_patch = None

                    for pts in sorted_times:
                        rel_t = pts - start_sec
                        if s_rel <= rel_t <= e_rel:
                            flist = frames_timeline.get(pts, [])
                            matched = [f for f in flist if abs(f["center_x"] - spk_cx) <= dist_thresh]
                            if matched:
                                presence_count += 1
                                best = max(matched, key=lambda f: float(f["area"]) * (float(f["score"]) ** 2))
                                prominence_sum += float(best["area"]) * (float(best["score"]) ** 2)
                                curr_patch = best.get("mouth_patch")
                                if curr_patch is not None and prev_patch is not None:
                                    mouth_diff_sum += float(np.mean(np.abs(curr_patch - prev_patch)))
                                prev_patch = curr_patch

                    # ATURAN EMAS: Jika pembicara TIDAK ADA di layar (presence == 0), skor = 0.0!
                    # Pembicara yang tidak terlihat sama sekali DILARANG KERAS dipilih.
                    if presence_count == 0:
                        speaker_scores[spk["id"]] = 0.0
                    else:
                        # Prominence wajah (ukuran & kejelasan) adalah faktor dominan penentu crop
                        speaker_scores[spk["id"]] = (presence_count * 15.0) + (mouth_diff_sum * 3.0) + (prominence_sum / 5000.0)

                best_spk_id = max(speaker_scores, key=lambda sid: speaker_scores[sid])
                best_score = speaker_scores[best_spk_id]

                if best_score > 0.0:
                    best_spk = next(s for s in detected_speakers if s["id"] == best_spk_id)
                else:
                    # Jika tidak ada speaker match di jendela ini, cari wajah terdekat dengan wajah paling terlihat
                    window_faces: list[dict[str, Any]] = []
                    for pts in sorted_times:
                        rel_t = pts - start_sec
                        if s_rel <= rel_t <= e_rel:
                            window_faces.extend(frames_timeline.get(pts, []))
                    if window_faces:
                        most_vis = max(window_faces, key=lambda f: float(f["area"]) * (float(f["score"]) ** 2))
                        best_spk = min(detected_speakers, key=lambda s: abs((s["center_x_pct"] * v_width / 100.0) - most_vis["center_x"]))
                    else:
                        best_spk = curr_spk

                curr_presence = speaker_scores.get(curr_spk["id"], 0.0)
                shot_len = s_rel - curr_shot_start

                # LOGIKA CUT OTOMATIS:
                # 1. Jika pembicara aktif saat ini TIDAK ADA di layar (curr_presence == 0), LANGSUNG POTONG
                #    ke pembicara yang ada agar tidak menyorot kursi/meja kosong!
                # 2. Jika pembicara lain memiliki skor kejelasan lebih tinggi dan durasi shot >= 2.0s
                should_cut = False
                if best_spk["id"] != curr_spk["id"]:
                    if curr_presence == 0.0 and best_score > 0.0:
                        should_cut = True
                    elif best_score > curr_presence + 3.0 and shot_len >= 2.0:
                        should_cut = True

                if should_cut:
                    raw_shots.append({
                        "start": round(curr_shot_start, 2),
                        "end": round(s_rel, 2),
                        "speakerId": curr_spk["id"],
                        "label": curr_spk["label"],
                        "offsetX": curr_spk["offset_x"],
                    })
                    curr_shot_start = s_rel
                    curr_spk = best_spk

            raw_shots.append({
                "start": round(curr_shot_start, 2),
                "end": round(clip_dur, 2),
                "speakerId": curr_spk["id"],
                "label": curr_spk["label"],
                "offsetX": curr_spk["offset_x"],
            })

            # MERGE ADJACENT SHOTS DENGAN PEMBICARA SAMA & PASTIKAN KONTINUITAS MULUS
            for s in raw_shots:
                if s["end"] <= s["start"]:
                    continue
                if not speaker_shots:
                    speaker_shots.append(s)
                elif speaker_shots[-1]["speakerId"] == s["speakerId"]:
                    speaker_shots[-1]["end"] = s["end"]
                elif s["end"] - s["start"] < 1.0:
                    speaker_shots[-1]["end"] = s["end"]
                else:
                    speaker_shots.append(s)

            if speaker_shots:
                speaker_shots[0]["start"] = 0.0
                speaker_shots[-1]["end"] = round(clip_dur, 2)
                for i in range(len(speaker_shots) - 1):
                    speaker_shots[i]["end"] = speaker_shots[i + 1]["start"]

                # Pastikan setiap shot mengunci posisi wajah pembicara terdeteksi, BUKAN tengah kosong
                for s in speaker_shots:
                    spk_match = next((sp for sp in detected_speakers if sp["id"] == s.get("speakerId")), None)
                    if spk_match:
                        s["offsetX"] = spk_match["offset_x"]
                        s["label"] = spk_match["label"]

        # Jika satu pembicara, buat 1 shot utuh
        if not speaker_shots:
            speaker_shots = [{
                "start": 0.0,
                "end": round(clip_dur, 2),
                "speakerId": 1,
                "label": "Pembicara Utama",
                "offsetX": round(float(offset_x_pct), 1),
            }]

        # ═══ SMART AUTO-ZOOM (CINEMATIC CLOSE-UP DETECTION) ═══
        # Jika wajah rata-rata kecil (< 20% tinggi video / wide shot), sarankan zoom 1.25x
        heights = [f.get("height", 0) for f in all_face_samples if f.get("height", 0) > 0]
        avg_face_h = float(np.mean(heights)) if heights else 0.0
        face_h_ratio = avg_face_h / v_height if v_height > 0 else 0.25
        suggested_zoom = 1.25 if (face_h_ratio < 0.20 and avg_face_h > 20) else 1.0

        # Tentukan default mode tracking cerdas
        if is_multi_speaker and len(speaker_shots) >= 2:
            tracking_mode = "auto_switch"
        elif is_moving_presenter and len(tracking_keyframes) >= 3:
            tracking_mode = "smooth_follow"
        else:
            tracking_mode = "static"

        logger.info(
            "FaceTracker: Klip [%.1f - %.1f]s -> Mode=%s, MultiSpeaker=%s (%d orang), Shots=%d, MotionSpan=%.1f%%, SuggestedZoom=%.2fx",
            start_sec,
            end_sec,
            tracking_mode,
            is_multi_speaker,
            len(valid_clusters),
            len(speaker_shots),
            motion_span,
            suggested_zoom,
        )

        return {
            "has_face": True,
            "offset_x": round(float(offset_x_pct), 1),
            "offset_y": round(float(offset_y_pct), 1),
            "confidence": round(float(avg_conf), 2),
            "speaker_side": speaker_side,
            "detected_speakers": detected_speakers,
            "is_multi_speaker": is_multi_speaker,
            "sample_count": len(all_face_samples),
            "tracking_mode": tracking_mode,
            "speaker_shots": speaker_shots,
            "tracking_keyframes": tracking_keyframes,
            "suggested_zoom": suggested_zoom,
        }

    except Exception as e:
        logger.error("FaceTracker: Gagal memproses video %s: %s", video_path, e)
        return {
            "has_face": False,
            "offset_x": 0.0,
            "offset_y": 0.0,
            "confidence": 0.0,
            "detected_speakers": [],
            "is_multi_speaker": False,
            "tracking_mode": "static",
            "speaker_shots": [],
            "tracking_keyframes": [],
            "suggested_zoom": 1.0,
        }
