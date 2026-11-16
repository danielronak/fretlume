"""
Spike S3 — "rectify-then-measure" fretboard registration (reference prototype).

Purpose: prove that, given a ROUGH homography (metric board -> image), a purely
classical refinement loop converges to a sub-fret-accurate homography on
synthetic frames with occlusion, blur and noise. Also measures the basin of
convergence, which sets the accuracy requirement for the coarse detector
(NeckNet) and for manual 4-tap calibration.

This file is the executable spec for packages/vision/src/edgeTracker.ts.
Run:  python proto.py --trials 300
"""
import argparse
import numpy as np
import cv2

# ----------------------------------------------------------------- board model
L = 648.0                      # scale length (mm)
N_FRETS = 21
NUT_W, F12_W = 43.0, 52.0      # fretboard width at nut / 12th fret (mm)


def fret_x(n):
    """Distance nut -> fret n (mm). n may be fractional."""
    return L * (1.0 - 2.0 ** (-np.asarray(n, dtype=np.float64) / 12.0))


X12 = float(fret_x(12))
X_END = float(fret_x(N_FRETS)) + 8.0


def half_w(x):
    return 0.5 * (NUT_W + (F12_W - NUT_W) * np.asarray(x) / X12)


def board_corners():
    """4 control points: nut-bass, nut-treble, end-treble, end-bass (mm)."""
    return np.array([[0, -half_w(0)], [0, half_w(0)],
                     [X_END, half_w(X_END)], [X_END, -half_w(X_END)]], np.float64)


def project(H, pts):
    p = np.c_[pts, np.ones(len(pts))] @ H.T
    return p[:, :2] / p[:, 2:3]


# ------------------------------------------------------------ synthetic frames
PXMM = 3.0                       # texture resolution
TX0, TY0 = -130.0, -70.0         # texture origin in board mm
TW, TH = int((X_END + 60 - TX0) * PXMM), int(140 * PXMM)


def mm2tex(x, y):
    return (np.asarray(x) - TX0) * PXMM, (np.asarray(y) - TY0) * PXMM


def render_texture(rng):
    img = np.zeros((TH, TW, 3), np.float32)
    alpha = np.zeros((TH, TW), np.float32)
    wood = rng.uniform(0.08, 0.45) * np.array([0.6, 0.75, 1.0]) * rng.uniform(0.6, 1.4, 3)
    neck = wood * rng.uniform(0.7, 1.6)

    def poly(pts_mm, color, a=1.0):
        px = np.stack(mm2tex(pts_mm[:, 0], pts_mm[:, 1]), 1).astype(np.int32)
        cv2.fillPoly(img, [px], [float(c) for c in color], lineType=cv2.LINE_AA)
        cv2.fillPoly(alpha, [px], a, lineType=cv2.LINE_AA)

    # headstock + neck body beyond the fretboard
    poly(np.array([[-120, -38], [-6, -half_w(0) - 1], [-6, half_w(0) + 1], [-120, 38]]), neck)
    poly(np.array([[-6, -half_w(0) - 2], [X_END + 50, -half_w(X_END) - 3],
                   [X_END + 50, half_w(X_END) + 3], [-6, half_w(0) + 2]]), neck)
    # fretboard
    c = board_corners()
    poly(c, wood)
    # wood grain
    grain = cv2.GaussianBlur(rng.normal(0, 1, (TH, TW)).astype(np.float32), (0, 0), 1, sigmaY=12)
    img += grain[..., None].transpose(0, 1, 2) * 0.03 * alpha[..., None]
    # inlays
    if rng.random() < 0.85:
        for n in (3, 5, 7, 9, 12, 15, 17, 19, 21):
            xm = 0.5 * (fret_x(n - 1) + fret_x(n))
            ys = (-9, 9) if n == 12 else (0,)
            for y in ys:
                u, v = mm2tex(xm, y)
                cv2.circle(img, (int(u), int(v)), int(rng.uniform(2.0, 3.6) * PXMM), (0.8, 0.8, 0.78), -1, cv2.LINE_AA)
    # nut
    poly(np.array([[-5, -half_w(0)], [0, -half_w(0)], [0, half_w(0)], [-5, half_w(0)]]), (0.85, 0.87, 0.9))
    # fret wires
    fw = rng.uniform(1.8, 2.9)
    bright = rng.uniform(0.55, 0.95)
    for n in range(1, N_FRETS + 1):
        x = fret_x(n)
        poly(np.array([[x - fw / 2, -half_w(x)], [x + fw / 2, -half_w(x)],
                       [x + fw / 2, half_w(x)], [x - fw / 2, half_w(x)]]), (bright,) * 3)
    # strings (nut spacing 35 mm, widening toward the bridge)
    for i in range(6):
        y0 = -17.5 + 7.0 * i
        y1 = y0 * 1.5
        u0, v0 = mm2tex(-60, y0)
        u1, v1 = mm2tex(L, y1 * 1.0)
        th = max(1, int(round((0.25 + 0.2 * (5 - i)) * PXMM)))
        cv2.line(img, (int(u0), int(v0)), (int(u1), int(v1)), (0.7, 0.68, 0.6), th, cv2.LINE_AA)
    return np.clip(img, 0, 1), alpha


def random_h(rng, W=1280, Hh=720):
    """Random plausible placement of the neck in a webcam frame."""
    c = board_corners()
    length = rng.uniform(560, 980)                      # px length nut->end
    s = length / X_END
    ang = np.deg2rad(rng.uniform(-22, 22))
    R = np.array([[np.cos(ang), -np.sin(ang)], [np.sin(ang), np.cos(ang)]])
    ctr = np.array([W / 2 + rng.uniform(-90, 90), Hh / 2 + rng.uniform(-110, 110)])
    dst = (c - c.mean(0)) * s @ R.T + ctr
    # perspective: scale one end, squeeze width
    k = rng.uniform(0.72, 1.3)
    mid_a, mid_b = dst[:2].mean(0), dst[2:].mean(0)
    dst[:2] = mid_a + (dst[:2] - mid_a) * k
    dst += rng.normal(0, 3.0, dst.shape)
    if rng.random() < 0.5:                              # mirrored (selfie) view
        dst[:, 0] = W - dst[:, 0]
    return cv2.getPerspectiveTransform(c.astype(np.float32), dst.astype(np.float32)).astype(np.float64)


def make_frame(rng, W=1280, Hh=720):
    tex, alpha = render_texture(rng)
    H = random_h(rng, W, Hh)
    T = np.array([[PXMM, 0, -TX0 * PXMM], [0, PXMM, -TY0 * PXMM], [0, 0, 1]])   # mm -> tex px
    M = H @ np.linalg.inv(T)
    fg = cv2.warpPerspective(tex, M, (W, Hh), flags=cv2.INTER_AREA)
    a = cv2.warpPerspective(alpha, M, (W, Hh), flags=cv2.INTER_AREA)[..., None]
    bg = cv2.GaussianBlur(rng.uniform(0, 1, (Hh // 8, W // 8, 3)).astype(np.float32), (0, 0), 3)
    bg = cv2.resize(bg, (W, Hh), interpolation=cv2.INTER_CUBIC)
    for _ in range(rng.integers(3, 9)):                 # clutter with hard edges
        p = rng.uniform(0, 1, (4, 2)) * [W, Hh]
        cv2.fillPoly(bg, [p.astype(np.int32)], [float(v) for v in rng.uniform(0, 1, 3)])
    frame = fg * a + bg * (1 - a)
    frame *= rng.uniform(0.6, 1.3)
    # fretting-hand occluder: skin blob covering 3-5 frets + fingers across the board
    n0 = rng.uniform(0.3, 12)
    centre = project(H, np.array([[float(fret_x(n0 + 1.5)), rng.uniform(-10, 14)]]))[0]
    span = np.linalg.norm(project(H, np.array([[float(fret_x(n0 + 3.5)), 0.0]]))[0] - project(H, np.array([[float(fret_x(n0)), 0.0]]))[0])
    skin = np.array([0.55, 0.65, 0.85]) * rng.uniform(0.5, 1.2)
    occ = np.zeros((Hh, W), np.float32)
    cv2.ellipse(occ, (int(centre[0]), int(centre[1])), (int(span * 0.55), int(span * rng.uniform(0.25, 0.5))),
                float(rng.uniform(0, 180)), 0, 360, 1.0, -1, cv2.LINE_AA)
    for _ in range(4):                                  # fingers
        q = centre + rng.normal(0, span * 0.35, 2)
        cv2.line(occ, (int(centre[0]), int(centre[1])), (int(q[0]), int(q[1])), 1.0, int(max(6, span * 0.12)), cv2.LINE_AA)
    frame = frame * (1 - occ[..., None]) + skin * occ[..., None]
    frame = cv2.GaussianBlur(frame, (0, 0), rng.uniform(0.6, 1.8))
    frame += rng.normal(0, rng.uniform(0.005, 0.03), frame.shape)
    return (np.clip(frame, 0, 1) * 255).astype(np.uint8), H


# ------------------------------------------------------------------ the tracker
SW, SH = 768, 128                # rectified strip size (px)
SX0, SX1 = -14.0, X_END + 6.0    # strip covers this board x range (mm)
SYH = 36.0                       # strip covers y in [-SYH, +SYH] (mm)
S = np.array([[SW / (SX1 - SX0), 0, -SX0 * SW / (SX1 - SX0)],
              [0, SH / (2 * SYH), SH / 2], [0, 0, 1]])        # board mm -> strip px
S_inv = np.linalg.inv(S)


def fit_h(src, dst, w):
    """Weighted DLT with Hartley normalisation. src: board mm, dst: image px."""
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
    Hn = vt[-1].reshape(3, 3)
    Hh = np.linalg.inv(Tb) @ Hn @ Ta
    return Hh / Hh[2, 2]


def proj1d_from_pairs(u, up):
    """Batched 1-D projective map through 3 point pairs. u: (3,), up: (B,3) -> (a,b,g) each (B,)."""
    A = np.stack([np.broadcast_to(u, up.shape), np.ones_like(up), -u * up], -1)    # (B,3,3)
    sol = np.linalg.solve(A, up[..., None])[..., 0]
    return sol[:, 0], sol[:, 1], sol[:, 2]


def comb_search(P, cols, sp, ranges, steps):
    """Global 1-D alignment of the fret comb.
    P: fret-evidence profile over strip columns. cols: predicted column of fret 0..N. sp: local spacing (px).
    Searches displacements of three anchor frets (0, 7, 17); returns corrected columns for every fret."""
    anchors = (0, 7, 17)
    grids = [np.linspace(-r, r, k) * sp[a] for a, r, k in zip(anchors, ranges, steps)]
    D = np.stack(np.meshgrid(*grids, indexing='ij'), -1).reshape(-1, 3)
    u = cols[list(anchors)]
    a, b, g = proj1d_from_pairs(u, u + D)
    cp = (a[:, None] * cols[None, 1:] + b[:, None]) / (g[:, None] * cols[None, 1:] + 1.0)   # frets 1..N
    valid = (cp > 2) & (cp < len(P) - 3) & (np.diff(np.c_[cp[:, :1] - 1, cp], axis=1) > 0)
    idx = np.clip(np.round(cp).astype(int), 0, len(P) - 1)
    score = (P[idx] * valid).sum(1)
    score -= 1e-3 * (D / sp[list(anchors)]).__abs__().sum(1) * score.max()      # mild prior toward the prediction
    k = int(np.argmax(score))
    full = (a[k] * cols + b[k]) / (g[k] * cols + 1.0)
    return full, float(score[k])


def refine(gray, H, iters=5, wide=True):
    """One registration. wide=True: (re)initialisation ranges; wide=False: frame-to-frame tracking ranges.
    Returns (H_refined, n_fret_inliers, score)."""
    info = (0, 0.0)
    ns = np.arange(0, N_FRETS + 1)
    xs = fret_x(ns)
    kx, ky = SW / (SX1 - SX0), SH / (2 * SYH)
    cols0 = (xs - SX0) * kx
    sp = np.r_[np.diff(cols0), np.diff(cols0)[-1]]
    for it in range(iters):
        # 1. rectify: strip <- image
        M = H @ S_inv                                   # strip px -> image px
        strip = cv2.warpPerspective(gray, M, (SW, SH), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP).astype(np.float32)
        strip = cv2.GaussianBlur(strip, (0, 0), 1.0)
        # 2. fret evidence: bright vertical ridges => -d2/dx2 (strings have ~zero response)
        d2 = -(np.roll(strip, 3, 1) + np.roll(strip, -3, 1) - 2 * strip)
        d2[d2 < 0] = 0
        rc0, rc1 = int((-13 + SYH) * ky), int((13 + SYH) * ky)
        # 3. global comb alignment, done separately on the bass and treble halves so that a skewed
        #    initial guess (frets slanted in the strip) is recovered too. Kills periodic aliasing.
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
            x = float(xs[n]); hw = float(half_w(x))
            R = max(2, int(sp[n] * 0.22))
            found = []
            for bi, band in enumerate((-1, +1)):        # bass half / treble half -> captures skew
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
            # 4. across-neck evidence: the fret wire ENDS exactly at the board edge.
            if len(found) == 2 and n >= 1:
                cs = int(round(0.5 * (found[0] + found[1])))
                E = d2[:, cs - 1:cs + 2].mean(1)
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
        n_meas = len(src)
        if n_meas < 14:
            return H, 0, 0.0
        src = np.asarray(src, np.float64); dst_img = project(M, np.asarray(dst, np.float64))
        w0 = np.asarray(wts, np.float64); w = w0.copy()
        Hn = H
        for _ in range(4):                              # IRLS, Tukey biweight
            Hn = fit_h(src, dst_img, w)
            r = np.linalg.norm(project(Hn, src) - dst_img, axis=1)
            s = 1.4826 * np.median(r) + 0.5
            w = w0 * np.where(r < 3 * s, (1 - (r / (3 * s)) ** 2) ** 2, 0.0)
            if (w > 0).sum() < 12:
                return H, 0, 0.0
        H = Hn
        info = (int((w > 0).sum()), float(w.sum()))
    return H, info[0], info[1]


def refine_multistart(gray, H, across_px=(-7.0, 0.0, 7.0), rot_deg=(-3.0, 0.0, 3.0)):
    """(Re)initialisation only: run refine() from a small grid of across-shift / in-plane-rotation
    perturbations of the rough guess and keep the best-scoring result. ~9 refines; not used per frame."""
    c = board_corners()
    p = project(H, c)
    ctr = p.mean(0)
    axis = (p[2:].mean(0) - p[:2].mean(0)); axis /= np.linalg.norm(axis)
    nrm = np.array([-axis[1], axis[0]])
    best = (H, 0, -1.0)
    for d in across_px:
        for a in rot_deg:
            t = np.deg2rad(a)
            Rm = np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]])
            q = (p - ctr) @ Rm.T + ctr + d * nrm
            H0 = cv2.getPerspectiveTransform(c.astype(np.float32), q.astype(np.float32)).astype(np.float64)
            out = refine(gray, H0)
            if out[2] > best[2]:
                best = out
    return best


# ------------------------------------------------------------------- evaluation
def fret_err_units(H, Hgt):
    """Max over frets 0..17 of |position error| / local fret spacing, plus across error in string spacings."""
    worst_along, worst_across = 0.0, 0.0
    for n in range(0, 18):
        x = float(fret_x(n))
        for y in (-14.0, 0.0, 14.0):
            p_gt = project(Hgt, np.array([[x, y]]))[0]
            # where does the estimate think this image point is, in board mm?
            q = project(np.linalg.inv(H), p_gt[None])[0]
            sp = float(fret_x(n + 1) - fret_x(n))
            worst_along = max(worst_along, abs(q[0] - x) / sp)
            worst_across = max(worst_across, abs(q[1] - y) / 7.0)
    return worst_along, worst_across


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--trials', type=int, default=200)
    ap.add_argument('--dump', type=str, default='')
    ap.add_argument('--multistart', action='store_true')
    args = ap.parse_args()
    rng = np.random.default_rng(0)
    levels = [2, 5, 8, 12, 16, 22]      # init corner noise sigma (px)
    res = {lv: [] for lv in levels}
    for t in range(args.trials):
        frame, Hgt = make_frame(rng)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        c = board_corners()
        for lv in levels:
            noisy = project(Hgt, c) + rng.normal(0, lv, (4, 2))
            H0 = cv2.getPerspectiveTransform(c.astype(np.float32), noisy.astype(np.float32)).astype(np.float64)
            a0, x0 = fret_err_units(H0, Hgt)
            H1, ninl, score = (refine_multistart if args.multistart else refine)(gray, H0)
            a1, x1 = fret_err_units(H1, Hgt)
            res[lv].append((a0, x0, a1, x1, ninl))
        if args.dump and t < 6:
            vis = frame.copy()
            H1, _, _ = refine(gray, H0)
            for n in range(0, N_FRETS + 1):
                x = float(fret_x(n))
                p = project(H1, np.array([[x, -half_w(x)], [x, half_w(x)]])).astype(int)
                cv2.line(vis, tuple(p[0]), tuple(p[1]), (0, 255, 0), 1, cv2.LINE_AA)
                p0 = project(H0, np.array([[x, -half_w(x)], [x, half_w(x)]])).astype(int)
                cv2.line(vis, tuple(p0[0]), tuple(p0[1]), (0, 0, 255), 1, cv2.LINE_AA)
            cv2.imwrite(f'{args.dump}/frame_{t}.jpg', vis)
    print('init_sigma_px | init along(med) | refined along (med / p90) | refined across (med / p90) | success(<0.25 fret & <0.35 string)')
    for lv in levels:
        r = np.asarray(res[lv])
        ok = np.mean((r[:, 2] < 0.25) & (r[:, 3] < 0.35))
        print(f'{lv:>5} | {np.median(r[:, 0]):.2f} | {np.median(r[:, 2]):.3f} / {np.percentile(r[:, 2], 90):.3f} | '
              f'{np.median(r[:, 3]):.3f} / {np.percentile(r[:, 3], 90):.3f} | {ok * 100:.0f}%')


if __name__ == '__main__':
    main()
