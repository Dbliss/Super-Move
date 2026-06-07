import sys, re

EPS = 1e-6

def cap(path):
    lines = open(path, encoding="utf-8").read().splitlines()

    # Parse vertices (1-based index)
    verts = [None]  # placeholder for index 0
    for ln in lines:
        if ln.startswith("v "):
            parts = ln.split()
            verts.append((float(parts[1]), float(parts[2]), float(parts[3])))

    ys = [v[1] for v in verts[1:]]
    ymin = min(ys)
    # Footprint extents from the bottom panel only (ignore splayed top flaps)
    bottom_verts = [v for v in verts[1:] if abs(v[1]-ymin) < EPS]
    xmin = min(v[0] for v in bottom_verts); xmax = max(v[0] for v in bottom_verts)
    zmin = min(v[2] for v in bottom_verts); zmax = max(v[2] for v in bottom_verts)

    def is_corner(v):
        return (abs(v[0]-xmin) < EPS or abs(v[0]-xmax) < EPS) and \
               (abs(v[2]-zmin) < EPS or abs(v[2]-zmax) < EPS)

    # Rim height = highest footprint-corner vertex (the box-body top opening)
    top = max(v[1] for v in verts[1:] if is_corner(v))
    dy = top - ymin
    print(f"{path}: ymin={ymin} rim_top={top} translate=+{dy:.4f}")

    def vidx(tok):  # vertex index from a face token "v/vt/vn"
        return int(tok.split("/")[0])

    # Collect bottom-panel faces: every vertex on y==ymin. Dedup across groups.
    bottom_faces = []
    seen = set()
    for ln in lines:
        if not ln.startswith("f "):
            continue
        toks = ln.split()[1:]
        if all(abs(verts[vidx(t)][1] - ymin) < EPS for t in toks):
            key = tuple(toks)
            if key not in seen:
                seen.add(key)
                bottom_faces.append(toks)

    if not bottom_faces:
        print("  no bottom faces found, skipping")
        return

    # Build new raised vertices for each old vertex used by bottom faces
    used = []
    for f in bottom_faces:
        for t in f:
            used.append(vidx(t))
    used = sorted(set(used))
    remap = {}
    new_v_lines = []
    next_idx = len(verts)  # next available 1-based index (== current count)
    for old in used:
        x, y, z = verts[old]
        remap[old] = next_idx
        new_v_lines.append(f"v {x} {y + dy} {z} ")
        next_idx += 1

    # New cap faces: same vt/vn refs, remapped vertex index
    new_f_lines = []
    for f in bottom_faces:
        out = []
        for t in f:
            sub = t.split("/")
            sub[0] = str(remap[int(sub[0])])
            out.append("/".join(sub))
        new_f_lines.append("f " + " ".join(out) + " ")

    appendix = [""] + ["# --- top cap (duplicated bottom panel raised to rim) ---"]
    appendix += new_v_lines + ["usemtl wood"] + new_f_lines + [""]

    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines + appendix))
    print(f"  added {len(new_v_lines)} verts, {len(new_f_lines)} cap faces")

for p in sys.argv[1:]:
    cap(p)
