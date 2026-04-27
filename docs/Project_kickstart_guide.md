# Project Kickstart Guide — PavePal Capstone

A first-look orientation for the data shared on **2026-04-26** in [data_20260426/](data_20260426/). Read this before opening any files.

---

## 1. The 30-second project recap

PavePal drives a vehicle past a road, snaps thousands of pavement images, runs computer vision to count cracks/potholes/manhole covers, and rolls those up into a **PCI (Pavement Condition Index)** score per road segment. The capstone is to build a **RAG-based chatbot + framework** that, given a segment's PCI and observed defects, answers "what should we do next, and how cheap can we do it?" — grounded in:

- the **GDOT Pavement Preservation Guide** (gold-standard rule book), and
- the **city's own historical pavement management reports + cost data**.

The deliverable is judged less on cleverness and more on **trustworthiness of retrieval** (does it cite the right doc? does it answer consistently? does it hallucinate?).

---

## 2. The questions you brought into this conversation, answered up front

### Q1. What data do I actually have?

11 distinct artifacts (some duplicated as zips). They split into **three buckets**:

| Bucket | What it is | Files |
|---|---|---|
| A. PavePal's own CV output | The road-image inspection results PavePal produced themselves | `locations (2).json`, `roadSegments (2).json` |
| B. Domain rule book (gold standard) | 472-page GDOT engineering guide on what to do for which defects | `GDOT PAVEMENT PRESERVATION GUIDE (1) (1).pdf` |
| C. City's historical pavement studies | Two snapshots of Peachtree Corners' citywide pavement program — a 2015 baseline and a 2022/2023 update — plus 2024 contractor bid prices and GIS data | everything inside `relookingforroaddata_2015_baseline/` and `relookingforroaddata_2023_update/` |

### Q2. What does the data really mean?

Read it as a **chain of evidence** behind a single claim ("this road needs X repair for $Y"):

```
 raw images  →  CV defect counts  →  segment-level PCI  →  rehab recommendation  →  unit-price cost
 (not given)    locations.json       roadSegments.json    GDOT guide + IMS report    2024 bid PDF
```

Each layer is in your data folder *except the raw images themselves*. Your chatbot will draw evidence from across this chain.

### Q3. What's the difference between `relookingforroaddata_2015_baseline/` and `relookingforroaddata_2023_update/`?

**Not a duplicate.** Despite the original lazy naming on the share (`relookingforroaddata` and `relookingforroaddata (1)`, since renamed), these are **two different vintages of the same kind of study**, both prepared for Peachtree Corners GA by IMS Infrastructure Management Services. Side-by-side:

| Aspect | `relookingforroaddata_2015_baseline/` (older) | `relookingforroaddata_2023_update/` (newer) |
|---|---|---|
| Survey vintage | **2015** (PCI Survey Date `2015-07-01`) | **2022** field survey, **2023** report |
| Main report PDF | `Peachtree Corners GA 2015 Report_Rev2.pdf` — 155 pages, Sept 2015 | `Peachtree Corners Report 2023.pdf` — 104 pages, May 2023 |
| Main workbook | `PeachTree_Corners_Analysis_Rev2.xlsx` — 24 sheets, ~1,034 segments, `$1.5M` annual rehab scenario | `PeachtreeCornersGA2022_ESA_5Yr_Rev2.xlsm` — 50 sheets, full 5-year plan at `$3.506M` annual budget, plus `Need Year` / `Post Rehab PCI` / `Annual PCI` / `Rehab Activities` sheets |
| Extras unique to this folder | `PeachtreeCorners_byGISID_Rev2.xlsx` (segment detail), `PeachtreeCornersGA_AnalysisRev2.kmz` (Google Earth map), 2015 PDF | `Neighborhood PCI Averages 2023.xlsx` (neighborhood-level rollups + 2015→2022 trends), `Peachtree Corners 2022 Pavement Management Data.zip` (ArcGIS shapefile), `PTC 24-05 2024 Street Resurfacing Full Bid Tabulation.pdf` (2024 contractor unit prices) |
| Best use | longitudinal/trend comparison; understanding the 2015 baseline | the **primary** working dataset — most current PCI, most detailed rehab plan, real cost data, GIS layer |

**Practical implication:** treat the `(1)` folder as the *current* state of the network and the non-`(1)` folder as *historical context*. The two together let you measure how PCI evolved 2015 → 2022, which is itself a useful retrieval test case ("did this segment get worse?").

The two top-level `.zip` files (`relookingforroaddata.zip` and `relookingforroaddata (1).zip`) are just zipped copies of the two folders — same content, no new info.

### Q4. What should I read/open first?

In this order, ~30 min total:
1. **`Peachtree Corners Report 2023.pdf`** — the 104-page exec report. Skim §1 (Exec Summary), §3 (Methodology), §4 (Condition Results), §5 (Rehab Plan). This single doc explains 80% of what every other file means.
2. **`Definitions` sheet** in `PeachtreeCornersGA2022_ESA_5Yr_Rev2.xlsm` — IMS's acronym dictionary (PCI, SDI, RI, SI, GFP, FunCL, LADD, etc.). Keep it open as a reference card.
3. **`Rehab Activities` sheet** in the same xlsm — the table that maps PCI thresholds → rehab activity → unit cost. This is *exactly* the kind of table a RAG system needs to retrieve from to answer "what's the cheapest next step?".
4. **First 30 pages of `GDOT PAVEMENT PRESERVATION GUIDE.pdf`** — the gold-standard rule book.

---

## 3. File-by-file detail

### 3a. Top-level files (the "live" PavePal data + gold standard)

#### `locations (2).json` — 16.2 MB GeoJSON
- **What:** `FeatureCollection` of **20,829** point features. Each feature is a single road image with its detected defects.
- **Schema (per feature):**
  ```
  _id           Mongo-style id
  geometry      Point [longitude, latitude]
  properties:
    name        image filename, e.g. "GX010224_time_4_00250"
    image_path  e.g. "session_1/05142025/peachtree_corners_GX010224-2025-06-10/...jpg"
    road_name   e.g. "ENGINEERING DR"     (3,165 features have UNK)
    defects     dict: {"transverse cracks": 1, "manhole covers": 1, ...}
    type        "location"
  road_id       FK → roadSegments[]._id
  region_id     "usa_georgia_peachtree-corners" (all 20,829)
  ```
- **Defect taxonomy + total counts across all images:**
  | Defect | Total count |
  |---|---:|
  | longitudinal cracks | 29,277 |
  | transverse cracks | 18,760 |
  | block cracks | 3,709 |
  | alligator cracks | 2,812 |
  | manhole covers | 1,286 |
  | potholes | 604 |
  | patching | 28 |
  | repaired cracks | 11 |
  | sealing | 1 |
- **Capture sessions** (date encoded in image_path): May 14–21 2025 (≈17,576 images) and July 17–19 2025 (≈3,771 images).
- **Sanity check:** 3,406 of the 20,829 images have **no defects detected** — useful as negative class for any modelling/eval.

#### `roadSegments (2).json` — 5.0 MB GeoJSON
- **What:** `FeatureCollection` of **1,960** road segment LineStrings totaling **304.1 km** in Peachtree Corners.
- **Schema (key fields):**
  ```
  geometry           LineString of [lon, lat] coords
  source             "city_provided" (all 1,960)
  properties:
    name             "RIVER TRAIL DR"
    centerline_id    "223312"
    ROADCLASS        Residential (1305) | Major Arterial (499) | Private (70) |
                     Highway (59) | Ramp (25) | Minor Arterial (1) | Minor Collector (1)
    speed_limit      mph
    length_km        segment length
    scanned          "scanned" (1,467) | "scheduled" (493)   ← 75% complete
    pci              0–100 score                              ← ONLY on the 1,467 scanned
    pci_category     bin label
    raw_pci          pre-aged score
    defects          rollup dict mirroring locations.json keys
    + ~25 city GIS fields (FROMLEFT/TORIGHT, OWNEDBY, ZIPLEFT, etc.)
  ```
- **What this means:** the city handed PavePal a list of 1,960 road segments. PavePal has driven & scored 1,467 of them so far; 493 remain on the schedule. The PCI score is the headline output — the chatbot's main input variable.

#### `GDOT PAVEMENT PRESERVATION GUIDE (1) (1).pdf` — 15.4 MB, 472 pages
- **Title:** "An Enhanced GDOT Pavement Preservation Guide with Optimal Timing of Pavement Preservation"
- **Authors:** Yichang (James) Tsai et al., Georgia Tech, for **Georgia DOT Research Project 14-06** (Jan 2021).
- **Why it matters:** this is the **"gold standard"** the chatbot must ground its recommendations against. It covers project selection, specifications, material selection, construction procedures, and QA/QC for treatments like fog seal, crack sealing, and overlays.
- **Heads-up:** the PDF's TOC is structurally weird (Word-exported with poor anchors), so naive PyPDF outline extraction yields garbage. You will likely need to **chunk by heading + page** during ingestion rather than trust the bookmark tree.

### 3b. `relookingforroaddata_2015_baseline/` — the **2015 baseline** package

| File | Size | What it is |
|---|---:|---|
| `Peachtree Corners GA 2015 Report_Rev2.pdf` | 3.4 MB | IMS's Sept 2015 pavement management analysis report. 155 pages. Authoritative narrative. |
| `PeachTree_Corners_Analysis_Rev2.xlsx` | 6.4 MB | Workbook backing the 2015 report. 24 sheets. **Key sheets:** `App A Inventory` (1,034 segments, columns include GISID, On Street, From/To Street, FunCL, Pavetype, Pavement Width, PCI, SDI, RI, SI, Strength Rating, Condition Rating, Load/Non-Load Deducts, **PCI Survey Date `2015-07-01`**); `App B Rehab by Seg` ($1.5M scenario, has Project ID, Need Year, Selected Rehab Year, Segment Rehab Results); `App C Rehab by Year`; `Network`, `Annual PCI`, `Post Rehab PCI`. |
| `PeachtreeCorners_byGISID_Rev2.xlsx` | 7.6 MB | Segment-level deep dive keyed by GISID. **Key reference:** the `ACP` sheet defines the **Condition Rating ↔ PCI mapping** (1=Very Poor=25, 2=Poor=35, 3=Marginal=45, 4=Fair=55, 5=Good=65, …). Useful when answers need to translate between the numeric PCI and the verbal label. |
| `PeachtreeCornersGA_AnalysisRev2.kmz` | 654 KB | Google Earth file showing the analysis spatially. Open in Google Earth Pro for visual context; not directly useful for RAG. |

### 3c. `relookingforroaddata_2023_update/` — the **2022/2023 update** package (treat as primary)

| File | Size | What it is |
|---|---:|---|
| `Peachtree Corners Report 2023.pdf` | 14.0 MB | IMS's May 2023 update report. 104 pages. **TOC:** §1 Exec Summary, §2 Principles, §3 Data Collection (incl. Pavement Condition Survey, ESA Pavement Management System), §4 Pavement Condition Survey Results, §5 Rehab Plan & Budget, §6 Project Recommendations. Appendix B is the **$3.506M/yr Street Rehabilitation Program by Segment**. |
| `PeachtreeCornersGA2022_ESA_5Yr_Rev2.xlsm` | 15.2 MB | The current working workbook. **50 sheets**, including: `Inventory` (~7,500 rows, 252 cols), `Rehab By Segment` (~7,500 rows × 15,955 cols — wide because it carries year-by-year scenario columns), `Rehab By Year`, `Annual PCI`, `Post Rehab PCI`, `Post Rehab Backlog`, `Need Year Rehab`, `Survey PCI`, `Current PCI`, `Rehab Activities` (the cost-rule table — see below), `Definitions` (acronym dictionary), `Inventory_CSV`, `Rehab_By_Segment_CSV`, `Need_Year_Rehab_CSV`. **Inventory header row is row 4, not row 1** (rows 1–3 are banner/title); same pattern in most sheets. |
| `Neighborhood PCI Averages 2023.xlsx` | 5.0 MB | Neighborhood-level rollups, 24 sheets. **Key sheets:** `Individual Street Values` (1,011 streets with `2015 Previous PCI/SDI/RI` columns next to current PCI — this is your **2015→2022 trend join**); `Neighborhood Detailed Ratings` (1,244 rows); `Neighborhood Summary` with `Condition Rating` (Fair/Good/Marginal/Poor) and `PCI Change` columns; `City GIS Data` (2,011 streets mapped to neighborhood + development type). |
| `Peachtree Corners 2022 Pavement Management Data.zip` | 534 KB | **ArcGIS shapefile** (`.shp` + `.dbf` + `.shx` + `.prj` + `.sbn` + `.sbx` + `.cpg` + `.shp.xml`). The 2022 PCI data as a spatial layer — load in QGIS / GeoPandas. The `.shp.xml` is FGDC metadata describing the attributes. |
| `PTC 24-05 2024 Street Resurfacing Full Bid Tabulation.pdf` | 203 KB | Single-page contractor bid tabulation from the city's 2024 resurfacing procurement (PTC 24-05). Lists unit prices from **7 different bidders** for line items like "Adjust Manholes to Grade" ($185–$1,850 ea), "Recycled Asphalt Patching" ($135–$218/TN), "Milling Asphalt Pvmt" ($2.38–$8.10/SY). **This is your only source of real-world 2024 dollar cost data** — invaluable for the "cheapest next step" question. |

#### What the `Rehab Activities` sheet actually looks like

This sheet is the heart of the cost-recommendation logic. It maps pavement type + PCI range → rehab activity → unit rate.

```
Pavetype  Code  Rehab Activity                     Min PCI  Max PCI  Base Rate ($/yd2)
All       5     Routine Maintenance                80       100      0
Asphalt   10    Slurry Seal / Seal Coat            70       80       2.25
Asphalt   20    MicroSurface / Chip Seal           60       70       3.10
Asphalt   30    Edge Mill + Thin Overlay           60       70       40.29
Asphalt   40    EM/FWM + Moderate Overlay          50       60       18.25
Asphalt   50    FWM + Thick Overlay (>2.5")        ...      ...      22.25
Asphalt   60    Surf Recon + Base Rehab            25       40       39.50
...
```

If you want a single retrieval target to test the chatbot on, pick this table. The question *"For an asphalt road with PCI 65, what is the cheapest acceptable rehab?"* has a deterministic answer here (`MicroSurface / Chip Seal` at $3.10/yd²), which makes it a great **failure-mode probe**: a hallucinating LLM will pick the wrong row.

---

## 4. How the data layers join together

```
roadSegments (2).json                         locations (2).json
─ 1,960 segments ─────────────────────────── 20,829 images
  _id  ←──────────── road_id ───────────────  road_id
  pci, ROADCLASS, defects (rollup)           defects (per-image), image_path
                  │
                  │ name == On Street + From Street + To Street
                  ▼
2022 ESA workbook  Inventory sheet          ← GISID is the city's master segment ID
  GISID, On Street, From/To Street, PCI      (unique per direction & block)
                  │
                  │ same GISID
                  ▼
2015 Analysis workbook  App A Inventory    ← gives you 2015→2022 PCI delta
  GISID, PCI Survey Date 2015-07-01, PCI, Condition Rating
                  │
                  │ links by On Street name
                  ▼
2024 Bid Tabulation PDF                     ← supplies real $/unit prices
  Item, Unit, Qty, Unit Price (× 7 bidders)
                  │
                  │ Activity name overlaps with...
                  ▼
2022 ESA workbook  Rehab Activities sheet   ← canonical PCI band → activity map
  PCI band → Rehab Activity → Base Rate ($/yd²)
                  │
                  │ engineering justification cross-reference
                  ▼
GDOT Preservation Guide PDF                 ← "why" behind each recommendation
  472 pages of authoritative guidance
```

Two natural join keys:
- **GISID** (string id, e.g. `1388`) links the city's two workbooks together cleanly.
- **`road_id` ↔ `_id`** links PavePal's two JSON files. **There is no clean key between PavePal's data and the city's GISID** out of the box — you'll likely need to join on road name (`road_name` ↔ `On Street`) plus geometry, and the join will be fuzzy. Worth flagging early.

---

## 5. Things that will bite you (record these now, save time later)

1. **Header rows are not row 1.** Most IMS spreadsheet sheets put a banner in rows 1–3 and the real header in row 4 (sometimes row 7). Set `header=` explicitly when reading with pandas, or write a heuristic.
2. **`Chartsheet` in workbooks.** A few "sheets" are actually charts, not data — `iter_rows()` will throw `'Chartsheet' object has no attribute 'iter_rows'`. Filter via `wb[name].sheet_state` / `isinstance(ws, openpyxl.chart.Chartsheet)` before iterating.
3. **Latitude/Longitude columns are blank** in `Inventory` and several other sheets — geometry lives in the GIS shapefile and the GeoJSONs, not in the workbooks. Don't waste time looking for it in Excel.
4. **PavePal CV taxonomy is finer than IMS's.** PavePal distinguishes longitudinal vs transverse vs block vs alligator cracks; the IMS reports often roll all crack types into "Load Associated Distress" (LADD) or "Non-Load Associated Distress" (NLAD). Bridging the two taxonomies is a real modelling decision, not a clerical one.
5. **The GDOT PDF outline is broken.** Don't trust `pypdf.PdfReader(...).outline` to give you a clean TOC. Plan to chunk by detected headings + page numbers.
6. **The 2024 bid tabulation is *seven* columns of bidder-specific prices** in one PDF page. Parsing it cleanly will need either Camelot/Tabula or careful manual structuring — it is **not** machine-readable as plain text.
7. **GISID links across the two folders, not across PavePal data.** If you want PavePal's per-image defect counts associated with an IMS segment, the bridge is `roadSegments.properties.name` ↔ `Inventory.On Street` (+ from/to), which is a fuzzy string match.
8. **Region scope is one city.** All 20,829 images and 1,960 segments are within `usa_georgia_peachtree-corners`. Don't generalize claims about geographic robustness from this dataset.

---

## 6. Suggested first three concrete tasks

1. **Build a unified segment table** that joins `roadSegments (2).json` (PCI, defects from CV) with the 2022 ESA `Inventory` sheet (GISID, FunCL, Pavetype, Pavement Area). Ship this as a single Parquet/CSV before doing anything else — every downstream task uses it.
2. **Extract the `Rehab Activities` table and the GDOT guide's recommendation tables into a structured JSON.** These are the highest-value retrieval targets.
3. **Write 10 evaluation prompts with known-correct answers** sourced directly from the `Rehab Activities` sheet (e.g., "asphalt, PCI 65, what's cheapest?" → MicroSurface). Use these as a regression suite for whatever RAG approach you try. This directly tackles the project's stated success criteria: *will AI make things up* and *will AI consistently recommend the same thing*.

---

## 7. Environment

A conda env `capstone_env` has been created with `pandas`, `openpyxl`, and `pypdf`. The export is at [env.yaml](env.yaml). To activate:

```bash
conda activate capstone_env
```

Add `geopandas`, `pyshp`, `pdfplumber`, and `langchain` (or whatever RAG stack you choose) when you start needing them — don't preinstall everything up front.

---

## 8. One-glance inventory

```
data_20260426/
└── UBC Capstone Project/
    ├── GDOT PAVEMENT PRESERVATION GUIDE (1) (1).pdf       15 MB   gold-standard rule book (472 pp.)
    ├── locations (2).json                                  16 MB   20,829 image-level CV detections
    ├── roadSegments (2).json                                5 MB   1,960 city road segments + PCI
    ├── relookingforroaddata_2015_baseline/                         2015 BASELINE package
    │   ├── Peachtree Corners GA 2015 Report_Rev2.pdf        3 MB   2015 IMS report (155 pp.)
    │   ├── PeachTree_Corners_Analysis_Rev2.xlsx             6 MB   2015 analysis workbook (24 sheets)
    │   ├── PeachtreeCorners_byGISID_Rev2.xlsx               8 MB   2015 segment detail by GISID
    │   └── PeachtreeCornersGA_AnalysisRev2.kmz             654 KB  Google Earth overlay
    ├── relookingforroaddata_2023_update/                           2022/2023 UPDATE package (PRIMARY)
    │   ├── Peachtree Corners Report 2023.pdf               14 MB   2023 IMS report (104 pp.)
    │   ├── PeachtreeCornersGA2022_ESA_5Yr_Rev2.xlsm        15 MB   2022 ESA workbook (50 sheets)
    │   ├── Neighborhood PCI Averages 2023.xlsx             5 MB    neighborhood rollups + 2015→2022 trends
    │   ├── Peachtree Corners 2022 Pavement Mgmt Data.zip  534 KB   ArcGIS shapefile (8 files)
    │   └── PTC 24-05 2024 Street Resurfacing Bid Tab.pdf  203 KB   2024 contractor unit prices
    ├── relookingforroaddata.zip                            17 MB   = zipped copy of 2015 folder (original)
    └── relookingforroaddata (1).zip                        28 MB   = zipped copy of 2023 folder (original)
```
