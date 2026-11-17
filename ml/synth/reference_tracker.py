"""Reference EdgeTracker (the Phase-0 spike, parameterised by instrument). The TypeScript tracker in
app/src/vision/edgeTracker.ts is checked against it (gate G3.1). Keep behaviour stable: it is a yardstick.

  python -m synth.reference_tracker --frames DIR --sigmas 2,5,8 --seed 0
writes DIR/inits.json (noisy starting homographies, shared with the TypeScript bench) and
DIR/reference.json (refined homographies and errors).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

from .instrument import INSTRUMENTS, Instrument, project

SW, SH = 768, 128
SYH = 36.0


def strip_matrix(inst: Instrument):
    sx0, sx1 = -14.0, inst.board_end_x + 6.0
    S = np.array([[SW / (sx1 - sx0), 0, -sx0 * SW / (sx1 - sx0)], [0, SH / (2 * SYH), SH / 2], [0, 0, 1]])
    return S, sx0, sx1


def fit_h(src, dst, w):
    def norm(p):
        m, s = p.mean(0), np.sqrt(2) / (p.std() + 1e-9)
        return np.array([[s, 0, -s * m[0]], [0, s, -s * m[1]], [0, 0, 1]])
    Ta, Tb = norm(src), norm(dst)
    a, b = project(Ta, src), project(Tb, dst)
    rows = []
    for (x, y), (u, v), wi in zip(a, b, np.sqrt(w)):
        rows.append(wi * np.array([-x, -y, -1, 0, 0, 0, u * x, u * y, u]))
        rows.append(wi * np.array([0, 0, 0, -x, -y, -1, v * x, v * y, v]))
    _, _, vt = np.linalg.svd(np.asarray(rows))
    Hh = np.linalg.inv(Tb) @ vt[-1].reshape(3, 3) @ Ta
    return Hh / Hh[2, 2]


def proj1d_from_pairs(u, up):
    A = np.stack([np.broadcast_to(u, up.shape), np.ones_like(up), -u * up], -1)
    sol = np.linalg.solve(A, up[..., None])[..., 0]
    return sol[:, 0], sol[:, 1], sol[:, 2]


def comb_search(P, cols, sp, ranges, steps, anchors=(0, 7, 17)):
    grids = [np.linspace(-r, r, k) * sp[a] for a, r, k in zip(anchors, ranges, steps)]
    D = np.stack(np.meshgrid(*grids, indexing='ij'), -1).reshape(-1, 3)
    u = cols[list(anchors)]
    a, b, g = proj1d_from_pairs(u, u + D)
    cp = (a[:, None] * cols[None, 1:] + b[:, None]) / (g[:, None] * cols[None, 1:] + 1.0)
    valid = (cp > 2) & (cp < len(P) - 3) & (np.diff(np.c_[cp[:, :1] - 1, cp], axis=1) > 0)
    idx = np.clip(np.round(cp).astype(int), 0, len(P) - 1)
    score = (P[idx] * valid).sum(1)
    score -= 1e-3 * np.abs(D / sp[list(anchors)]).sum(1) * score.max()
    k = int(np.argmax(score))
    return (a[k] * cols + b[k]) / (g[k] * cols + 1.0), float(score[k])


def refine(gray, H, inst: Instrument, iters=5, wide=True):
    S, sx0, sx1 = strip_matrix(inst)
    S_inv = np.linalg.inv(S)
    info = (0, 0.0)
    ns = np.arange(0, inst.frets + 1)
    xs = inst.fret_x(ns)
    kx, ky = SW / (sx1 - sx0), SH / (2 * SYH)
    cols0 = (xs - sx0) * kx
    sp = np.r_[np.diff(cols0), np.diff(cols0)[-1]]
    for it in range(iters):
        M = H @ S_inv
        strip = cv2.warpPerspective(gray, M, (SW, SH), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP).astype(np.float32)
        strip = cv2.GaussianBlur(strip, (0, 0), 1.0)
        d2 = -(np.roll(strip, 3, 1) + np.roll(strip, -3, 1) - 2 * strip)
        d2[d2 < 0] = 0
        rc0, rc1 = int((-13 + SYH) * ky), int((13 + SYH) * ky)

        def band_profile(y_lo, y_hi, sigma):
            Pb = np.median(d2[int((y_lo + SYH) * ky):int((y_hi + SYH) * ky)], axis=0)
            Pb = cv2.GaussianBlur(Pb[None], (0, 0), sigma)[0]
            return np.minimum(Pb, 3.0 * (np.percentile(Pb, 90) + 1e-3))
        if it == 0:
            rng_, st_ = ((0.45, 0.9, 1.6), (11, 19, 33)) if wide else ((0.2, 0.25, 0.3), (5, 7, 9))
            band_cols = [comb_search(band_profile(lo, hi, 2.0), cols0, sp, rng_, st_)[0]
                         for lo, hi in ((-16.0, -4.0), (4.0, 16.0))]
        else:
            band_cols = [cols0, cols0]
        src, dst, wts = [], [], []
        noise = np.median(d2[rc0:rc1]) + 1e-3
        for n in ns:
            x = float(xs[n]); hw = float(inst.half_width(x))
            R = max(2, int(sp[n] * 0.22))
            found = []
            for bi, band in enumerate((-1, +1)):
                c = band_cols[bi][n]
                c0, c1 = int(round(c)) - R, int(round(c)) + R + 1
                if c0 < 4 or c1 > SW - 4:
                    continue
                y_lo, y_hi = sorted((band * 0.15 * hw, band * 0.85 * hw))
                if it == 0:
                    y_lo, y_hi = sorted((band * 4.0, band * 16.0))
                r0, r1 = int((y_lo + SYH) * ky), int((y_hi + SYH) * ky)
                prof = np.median(d2[r0:r1, c0:c1], axis=0)
                k = int(np.argmax(prof)); peak = prof[k]
                if peak < 4.0 * noise or peak < 1.5:
                    continue
                off = 0.0
                if 0 < k < len(prof) - 1:
                    den = prof[k - 1] - 2 * prof[k] + prof[k + 1]
                    if den < 0:
                        off = 0.5 * (prof[k - 1] - prof[k + 1]) / den
                cs = c0 + k + off
                ym = 0.5 * (y_lo + y_hi)
                src.append([x, ym]); dst.append([cs, (ym + SYH) * ky]); wts.append(min(peak / (8 * noise), 1.0))
                found.append(cs)
            if len(found) == 2 and n >= 1:
                cs = int(round(0.5 * (found[0] + found[1])))
                E = d2[:, max(0, cs - 1):cs + 2].mean(1)
                E = cv2.GaussianBlur(E[None], (0, 0), 1.2)[0]
                inside = np.median(E[int((-0.6 * hw + SYH) * ky):int((0.6 * hw + SYH) * ky)]) + 1e-3
                for sgn in (-1, +1):
                    re = (sgn * hw + SYH) * ky
                    Rr = int((13 if it == 0 else 5) * ky)
                    best, best_r = 0.0, None
                    for r in range(int(re) - Rr, int(re) + Rr + 1):
                        if r - 5 < 0 or r + 5 >= SH:
                            continue
                        ins = E[r:r + 5].mean() if sgn < 0 else E[r - 4:r + 1].mean()
                        out = E[r - 5:r].mean() if sgn < 0 else E[r + 1:r + 6].mean()
                        cst = (ins - out) / inside
                        if cst > best:
                            best, best_r = cst, r
                    if best_r is not None and best > 0.45:
                        src.append([x, sgn * hw]); dst.append([cs, best_r + (-0.5 if sgn < 0 else 0.5)]); wts.append(0.6)
        if len(src) < 14:
            return H, 0, 0.0
        src = np.asarray(src, np.float64); dst_img = project(M, np.asarray(dst, np.float64))
        w0 = np.asarray(wts, np.float64); w = w0.copy()
        Hn = H
        for _ in range(4):
            Hn = fit_h(src, dst_img, w)
            r = np.linalg.norm(project(Hn, src) - dst_img, axis=1)
            s = 1.4826 * np.median(r) + 0.5
            w = w0 * np.where(r < 3 * s, (1 - (r / (3 * s)) ** 2) ** 2, 0.0)
            if (w > 0).sum() < 12:
                return H, 0, 0.0
        H = Hn
        info = (int((w > 0).sum()), float(w.sum()))
    return H, info[0], info[1]


def errors(H, Hgt, inst: Instrument, max_fret=17):
    """Worst error over frets 0..max_fret × three across positions: (fret spacings along, string spacings across)."""
    worst_along = worst_across = 0.0
    Hinv = np.linalg.inv(H)
    for n in range(0, max_fret + 1):
        x = float(inst.fret_x(n))
        sp = float(inst.fret_x(n + 1) - inst.fret_x(n))
        for y in (-14.0, 0.0, 14.0):
            p = project(Hgt, np.array([[x, y]]))
            q = project(Hinv, p)[0]
            worst_along = max(worst_along, abs(q[0] - x) / sp)
            worst_across = max(worst_across, abs(q[1] - y) / 7.0)
    return worst_along, worst_across


def noisy_start(Hgt, inst, sigma, rng):
    c = inst.control_points()
    noisy = project(Hgt, c) + rng.normal(0, sigma, (4, 2))
    return cv2.getPerspectiveTransform(c.astype(np.float32), noisy.astype(np.float32)).astype(np.float64)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--frames', required=True)
    p.add_argument('--sigmas', default='2,5,8')
    p.add_argument('--seed', type=int, default=0)
    p.add_argument('--limit', type=int, default=0)
    args = p.parse_args()
    folder = Path(args.frames)
    labels = [json.loads(line) for line in (folder / 'labels.jsonl').read_text().splitlines()]
    if args.limit:
        labels = labels[: args.limit]
    sigmas = [float(s) for s in args.sigmas.split(',')]
    rng = np.random.default_rng(args.seed)
    inits, results = [], []
    for lab in labels:
        inst = INSTRUMENTS[lab['instrument']]
        Hgt = np.array(lab['H'])
        gray = np.frombuffer((folder / f"{lab['index']:06d}.gray").read_bytes(), np.uint8).reshape(lab['height'], lab['width'])
        for sigma in sigmas:
            H0 = noisy_start(Hgt, inst, sigma, rng)
            H1, inliers, score = refine(gray, H0, inst)
            along, across = errors(H1, Hgt, inst)
            inits.append({'index': lab['index'], 'sigma': sigma, 'H0': H0.tolist()})
            results.append({'index': lab['index'], 'sigma': sigma, 'H': H1.tolist(), 'along': along, 'across': across,
                            'inliers': inliers, 'score': score})
    (folder / 'inits.json').write_text(json.dumps(inits))
    (folder / 'reference.json').write_text(json.dumps(results))
    for sigma in sigmas:
        rows = [r for r in results if r['sigma'] == sigma]
        ok = np.mean([(r['along'] < 0.25) and (r['across'] < 0.35) for r in rows])
        print(f'sigma {sigma}: success {ok * 100:.1f}%  median along {np.median([r["along"] for r in rows]):.3f}')


if __name__ == '__main__':
    main()
