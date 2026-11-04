# Writes the handout version of the talk: every slide on one page, in its final state (no reveal steps).
# The course on claude.ai shows these pages as pictures (artifact/slides/NN.png).
# Usage from the repository root:
#   python projects/gerstenhaber/artifact/handout.py
#   node tools/texbuild.mjs projects/gerstenhaber/scratch/Gerstenhaber_doklad_handout.tex
# The output goes to projects/gerstenhaber/scratch/ (not in git).
from pathlib import Path
here = Path(__file__).resolve().parent
src = (here.parent / "Gerstenhaber_doklad.tex").read_text(encoding="utf-8")
old = r"\documentclass[aspectratio=169,10pt,xcolor=table,t]{beamer}"
assert src.count(old) == 1, "documentclass line changed: update handout.py"
out = here.parent / "scratch" / "Gerstenhaber_doklad_handout.tex"
out.parent.mkdir(exist_ok=True)
out.write_text(src.replace(old, r"\documentclass[aspectratio=169,10pt,xcolor=table,t,handout]{beamer}"),
               encoding="utf-8", newline="\n")
print("written", out)
