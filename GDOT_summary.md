# GDOT Pavement Preservation Guide — Summary

**Purpose:** Quick-reference summary of the GDOT Pavement Preservation Guide PDF for future LLMs (or humans) to know what's in the document and where to look. Built from a partial read of the actual PDF — high-value sections (Executive Summary, Conclusions, Recommendations, Chapter 1 intro, Table 66, Table 67, start of PACES manual) read directly; chapter-internal content described from the Table of Contents.

**Source PDF:** `data_20260426/UBC Capstone Project/GDOT PAVEMENT PRESERVATION GUIDE (1) (1).pdf`
**Date created:** 2026-05-07

---

## 1. Document metadata

| | |
|---|---|
| Title | An Enhanced GDOT Pavement Preservation Guide with Optimal Timing of Pavement Preservation |
| Type | Final Report — Georgia DOT Research Project 14-06 |
| Date | January 2021 |
| Period covered | June 2014 – January 2021 |
| Authors | Yichang (James) Tsai, Zhaohua Wang, Zhongyu Yang, Xinyi Zhang (Georgia Tech) |
| Sponsor | Georgia Department of Transportation, Office of Performance-based Management and Research |
| Total pages | 474 |
| Format | Text-heavy prose with embedded photos, graphs, and tables. Roughly 200 figures + 67 tables. Some pages (e.g. Table 66) are rotated 90° and dense. |

---

## 2. What the document is for

Per Chapter 1 (page 9):

> *"A comprehensive pavement preservation guide that defines pavement preservation methods, their application criteria, and performance is essential for the Georgia Department of Transportation (GDOT) to perform cost-effective pavement maintenance and achieve the best pavement performance with less money."*

The guide aims to:
1. Document GDOT pavement experts' tacit knowledge before retirement
2. Standardize project selection, specification, material selection, construction procedure, and QA/QC
3. Support GDOT's "right treatment, right time, right location" framework
4. Cover both asphalt (AC) and concrete (PCC) pavement preservation methods
5. Provide effectiveness research on the two most-used methods (crack sealing, fog seal)

The companion deliverable is the **PPIT (Pavement Preservation Interactive Tool)** — a web-based decision-support tool for GDOT field offices. The printed guide documents the PPIT.

---

## 3. Structural overview

### Chapter 1 — Introduction (pages 9–12)

Research background, objectives, and report organization. Contains the canonical pavement-deterioration curve (Figure 1, p. 9).

### Chapter 2 — Literature Review of Asphalt Pavement Preservation Methods (pages 13–116)

13 asphalt preservation methods, each with the same 5-section structure: *What is X? · How to Select Projects · Material Design · Construction Procedures and Considerations · Performance and Limitations.*

| Method | Page |
|---|---:|
| Fog Seal | 13 |
| Crack Sealing/Filling | 22 |
| Chip Seal | 32 |
| Micro-surfacing | 48 |
| Thin Overlay | 60 |
| Micro-Milling | 66 |
| White Topping | 76 |
| Pothole Patching | 81 |
| Open Graded Interlayer | 89 |
| Full Depth Reclamation | 92 |
| Hot In-Place Recycling | 97 |
| Cold In-Place Recycling | 104 |
| Ultra-Thin Bonded Wearing Course | 112 |

### Chapter 3 — Literature Review of Concrete Pavement Preservation Methods (pages 117–188)

Same 5-section structure for 5 concrete (PCC) methods.

| Method | Page |
|---|---:|
| Diamond Grinding | 117 |
| Partial Depth Repair | 137 |
| Dowel Bar Retrofit | 154 |
| Full Depth Repair | 172 |
| Joint Sealing | 177 |

### Chapter 4 — Crack Sealing Performance Study Using Historical COPACES Data (pages 189–202)

Statistical analysis of GDOT's historical COPACES survey data to evaluate crack sealing effectiveness over time. Source of the COPACES-band-vs-effectiveness numbers cited in the Executive Summary.

### Chapter 5 — Crack Sealing Effectiveness Study Using 3D Laser Technology (pages 203–294)

Field-test methodology, data collection, and analysis on **9 field-test sites** in Hawkinsville (south GA) and Covington (central GA), monitored quarterly over 3 years using 3D laser technology to measure crack growth.

### Chapter 6 — Field Test Study of Fog Seal Performance (pages 295–373)

Field tests on **13 sites on I-475** with different raveling conditions. Three test types: friction (locked-wheel skid number), smoothness (IRI), durability (aggregate loss).

### Chapter 7 — Conclusions and Recommendations (pages 374–381)

Overall summary of all three research parts (Guide development, Crack Sealing Study, Fog Seal Study). Largely overlaps the Executive Summary on pages 1–8.

### Appendix A — PPIT User Tutorial (pages 382–391)

Documentation of the PPIT web tool. **Contains the two most-important tables in the entire document for treatment selection:**

- **Table 66 (p. 390): GDOT AC Pavement Treatment Selection Guidelines** — the operational decision matrix for asphalt. Rows = distress type + severity level + traffic ADT band. Columns = ~25 treatment options. Cells: ▶ recommended, ● optional, ✗ not recommended. **This is the go-to table for "what treatment?" questions.**
- **Table 67 (p. 391): GDOT PCC Pavement Treatment Selection Guidelines** — same structure for concrete pavements (smaller, ~7 treatment columns).

### Appendix B — GDOT Pavement Condition Evaluation System (PACES) Manual (pages 392–440)

GDOT's official distress rating system. **Defines the severity levels (1, 2, 3) that Table 66 / Table 67 key off.** Each distress has a definition + photos illustrating each severity level.

| Distress | Page |
|---|---:|
| Rut Depth | 394 |
| Load Cracking | 395 |
| Block/Transverse Cracking | 403 |
| Reflection Cracking | 408 |
| Raveling | 413 |
| Edge Distress | 414 |
| Bleeding/Flushing | 417 |
| Corrugation/Pushing | 418 |
| Loss of Section | 420 |
| Patches, Potholes, and Local Base Failures | 423 |

Plus: Rating Survey procedure (424), Calculation of Project Rating (432), Pavement Maintenance and Rehabilitation Criteria (440).

### References (page 442)

---

## 4. Key facts for grounding answers (verified against the PDF)

### 4.1 The PCI / COPACES rating

Per Figure 1 (p. 9), pavement condition follows a non-linear deterioration curve:
- Drops 40% during the first 75% of service life
- Drops another 40% in the next 12% of service life
- Renovation costs 4–5× more late in life vs. early ($1 vs. $4–5)

**GDOT's pavement-quality bands** (Figure 1, high → low): **Excellent, Good, Fair, Poor, Very Poor, Failed**.

> **Note on band labels:** if a road-data source labels a road's `pci_category` as "Very Good" (a label not used in GDOT's Figure 1), that label is from a different framework — likely city-specific or a COPACES-derived classification. GDOT itself does not use "Very Good".

### 4.2 The "right treatment" framework

GDOT uses a **distress-based selection framework**, not a PCI-based one. From Chapter 1 (p. 10):

> *"a comprehensive, up-to-date pavement preservation guide based on GDOT's pavement distress protocol to select the right treatment on the right pavement at the right time"*

The operational decomposition:

| Question | Decision input | Where in the PDF |
|---|---|---|
| **What treatment?** | Distress type + severity level + traffic ADT | Table 66 (p. 390) for asphalt; Table 67 (p. 391) for concrete |
| **When to treat?** | PCI + deterioration curve (preserve early in life) | Figure 1 (p. 9), Chapter 2/3 "How to Select Projects" subsections |
| **How effective?** | COPACES range, severity level, distress type | Chapter 4 (crack sealing historical), Chapter 5 (crack sealing 3D laser), Chapter 6 (fog seal) |

### 4.3 Crack sealing effectiveness (key finding)

Per Executive Summary (p. 3) and Chapter 4:

| Pretreatment COPACES range | Crack sealing effectiveness (crack-growth retardation) |
|---|---|
| 66–69 | 40–48% |
| 79–85 | 52–72% |
| 93–98 | 82–124% |

- Higher pretreatment COPACES → better effectiveness.
- High effectiveness for **Severity Level 1** block/transverse cracking, regardless of crack length or percentage.
- Lower effectiveness for higher severity levels and for longitudinal load cracking in wheelpaths.
- **Updated GDOT policy:** crack sealing eligible up to a **maximum COPACES of 85–90** (raised from the prior threshold).

### 4.4 Fog seal effectiveness (key finding)

Per Executive Summary (pp. 4–5) and Chapter 6:

- **Friction:** skid number (SN) drops ~45% immediately after application; recovers to 30–35 in 2–4 days, ≥35 in 5–7 days.
- **Smoothness (IRI):** insignificant change (within 6 in/mile) before vs. after fog seal.
- **Durability (aggregate loss):**
  - Effective on medium/severe raveling (10–15% and 15–20% loss, both Severity Level 1): reduces aggregate loss by 30–90% and 40–70% respectively.
  - Limited effect on very light/light raveling (already low aggregate loss).

---

## 5. What kinds of questions this PDF can answer

| Question type | Where to look |
|---|---|
| What treatment for an asphalt road with [distresses + severity]? | **Table 66, p. 390** — operational decision matrix |
| What treatment for a concrete road with [distresses + severity]? | **Table 67, p. 391** |
| When should I do treatment X? | Chapter 2 / 3 "How to Select Projects" subsection for that treatment |
| How effective is crack sealing at COPACES band Y? | Chapter 4 + Executive Summary p. 3 |
| How effective is fog seal? | Chapter 6 + Executive Summary pp. 4–5 |
| What's the construction procedure for treatment X? | Chapter 2 / 3 "Construction Procedures and Considerations" subsection |
| What materials do I need? | Chapter 2 / 3 "Material Design" subsection |
| What are X's performance and limitations? | Chapter 2 / 3 "Performance and Limitations" subsection |
| How is severity measured for distress X? | **Appendix B (PACES Manual, pp. 392–440)** — distress definitions with photos |
| What's the deterioration curve / preservation timing logic? | Figure 1, p. 9 |
| What's the project-rating calculation? | PACES Manual, pp. 432–439 |

---

## 6. What this PDF does NOT cover

| Gap | Detail |
|---|---|
| Specific cost numbers per treatment | A handful of tables exist (e.g., Table 19 Washington Cost Comparison p. 135), but this isn't a cost catalog. Cost data lives in separate bid-tabulation files (NOT in the Phase 1 RAG corpus). |
| Specific roads or segments | This is a generic decision guide. Road-level data (PCI, defects, road class) lives in the project's JSONs (`roadSegments`, `locations`). |
| Severity-level data on specific roads | The PDF *defines* severity levels (PACES manual, Appendix B). The project's road-data JSONs only record defect *counts*, NOT severity. **This is a known corpus gap** — for any road-specific question that needs severity, the system has to flag the gap rather than hallucinate. |
| Heavy concrete-pavement coverage | Concrete is covered in Chapter 3 (5 methods, ~70 pages) but the focus is asphalt — all field-test research is on asphalt. |
| Newer treatments | The guide locks in 2021. Any newer GDOT methods are out of scope. |

---

## 7. Notes for RAG retrieval

- **Page-aware citations work well.** Every chapter has clear page boundaries; PDF has consistent page numbering. The roman-numeral preface is pages i–xvi (physical pages 1–17); doc page 1 (Executive Summary) starts on physical page 18.
- **Table 66 is challenging to retrieve as text.** It's rotated 90° and has ~25 × ~30 cells; standard PDF text extraction produces mangled output. The structured selection matrix is best understood from the page *image*. For a RAG that doesn't handle tables specifically, retrieving the page is enough — let the LLM reason from the surrounding text + the page reference.
- **The "How to Select Projects" subsections are short and high-value.** Each is 1–2 pages of focused project-selection criteria for one treatment. Natural chunks for RAG.
- **Appendix B (PACES Manual) is image-heavy.** Distress definitions are paired with photos that pure text extraction will lose. If severity questions matter, a vision-LLM pass on the relevant pages may be needed.
- **The Executive Summary (pp. 1–8) is dense with key findings.** Treat it as a high-priority retrieval target for any question about effectiveness or research conclusions.

---

## 8. Reading status (transparency)

| Section | Status |
|---|---|
| Title page, technical report, SI conversion | Read (pages i–iii) |
| Table of Contents + List of Figures + List of Tables | Read (pages iv–xvi) |
| Executive Summary + Conclusions + Recommendations | Read in full (pp. 1–8) |
| Chapter 1 — Introduction | Read in full (pp. 9–12) |
| Chapters 2 & 3 — Treatment literature reviews | **Not read** — described from TOC structure only |
| Chapters 4–6 — Effectiveness studies | Key findings extracted from Executive Summary and Conclusions; full chapter contents not read |
| Chapter 7 — Conclusions and Recommendations | **Not read** — but largely overlaps Executive Summary |
| Appendix A — PPIT (incl. Tables 66 + 67) | Read (pp. 388–391) |
| Appendix B — PACES Manual | Read intro + first distress (pp. 392–398); rest described from TOC |

For deeper questions about specific treatments, severity-level definitions, or construction procedures, the full chapter content would need to be read.
