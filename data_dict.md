# PavePal Capstone — Data Dictionary

A field-level reference for every data source in [data_20260426/](data_20260426/). Walked through one file at a time.

---

## `locations (2).json`

### Top-line summary

| Metric | Value |
|---|---:|
| File size | 16.2 MB |
| Top-level structure | A single GeoJSON `FeatureCollection` |
| Feature count | **20,829** |
| Unique `_id` values | 20,829 (no dupes — every row is a unique image) |
| Unique `road_id` values | **1,468** (so 20k images map onto ~1.5k road segments) |
| Region | `usa_georgia_peachtree-corners` (all features) |
| Export timestamp | `2025-09-26T15:38:36` (one batch export) |

### What this file is *not*

This file is the **post-inference summary** — the *output* of PavePal's existing CV pipeline, plus enough metadata to know which image each prediction came from. It does **not** contain the source images. The actual JPGs that `image_path` points to are not part of the shared dataset; they live on PavePal-internal storage.

| Layer | In this share? | Where it lives |
|---|---|---|
| Raw GoPro video clips (`GX010224.MP4`) | ❌ No | PavePal-internal |
| Extracted frame images (`GX010224_time_4_00250.jpg`) | ❌ No | PavePal-internal — `image_path` points to these |
| Object-detection outputs (bounding boxes, confidence scores) | ❌ No | PavePal-internal |
| **Aggregated per-image defect counts + GPS** | ✅ Yes | **this file** |
| Per-segment PCI rollup | ✅ Yes | `roadSegments (2).json` |

### What one row looks like

Every feature is a single road image taken from a GoPro-style camera mounted on a vehicle.

```json
{
  "_id": "68d703342294ad50adb9ebbf",
  "type": "Feature",
  "properties": {
    "name": "GX010224_time_4_00250",
    "image_path": "session_1/05142025/peachtree_corners_GX010224-2025-06-10/GX010224_time_4_00250.jpg",
    "defects": { "transverse cracks": 1, "manhole covers": 1 },
    "type": "location",
    "details": [],
    "road_name": "ENGINEERING DR"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [ -84.2250298889, 33.9611386944 ]
  },
  "road_id": "68d703332294ad50adb9eaa8",
  "region_id": "usa_georgia_peachtree-corners",
  "created_at": "2025-09-26T21:18:43.915000",
  "updated_at": "2025-09-26T21:18:43.915000"
}
```

### Field-by-field meaning

| Field | Type | What it means | Notes |
|---|---|---|---|
| `_id` | string | Mongo ObjectId for this image record | the *image's* primary key |
| `type` | string | Always `"Feature"` | required by GeoJSON spec |
| `properties.name` | string | Image base name, e.g. `GX010224_time_4_00250` | `GX######` is the GoPro source video; trailing `00250` is the frame number |
| `properties.image_path` | string | Relative path to the JPG on disk | format: `session_<N>/<MMDDYYYY>/peachtree_corners_<GoProID>-<upload_date>/<frame>.jpg` |
| `properties.defects` | dict | CV-detected defects in this single image, keyed by defect type, valued by **count** | `{}` means "nothing detected" — *not* "not yet scored" |
| `properties.type` | string | Always `"location"` | distinguishes from `roadSegments`'s `"road"` records |
| `properties.details` | list | **Always empty** — placeholder field, no data |
| `properties.road_name` | string | Human-readable street name | **missing on 3,165 of 20,829 features** (15%) — images where road context wasn't resolved |
| `geometry.type` | string | Always `"Point"` | one image = one GPS point |
| `geometry.coordinates` | `[lon, lat]` | WGS84 (EPSG:4326) | longitude first, latitude second — GeoJSON convention |
| `road_id` | string | FK to a road segment in `roadSegments (2).json` (`_id`) | **the join key** |
| `region_id` | string | Always `usa_georgia_peachtree-corners` | every image is in this one city |
| `created_at` / `updated_at` | ISO datetime | When the DB record was written, not when the photo was taken | every record has the same date — single export batch |

### The `defects` field — the most important one

Sparse dict: keys appear only if that defect type was detected. Counts are integers (how many of that defect were found in the image).

Distribution across all 20,829 images:

| Defect type | Total occurrences | Rough interpretation |
|---|---:|---|
| longitudinal cracks | 29,277 | Cracks parallel to direction of travel |
| transverse cracks | 18,760 | Cracks perpendicular to direction of travel |
| block cracks | 3,709 | Interconnected cracks dividing pavement into rectangles |
| alligator cracks | 2,812 | Interconnected cracks resembling alligator skin (load-related, structural) |
| manhole covers | 1,286 | Not a defect; asset detection |
| potholes | 604 | Classic pothole |
| patching | 28 | Patches (prior repairs) — itself a feature, not a defect |
| repaired cracks | 11 | Sealed/filled cracks |
| sealing | 1 | Seal coat |

Per-image stats:

| Stat | Value |
|---|---:|
| Images with **zero** defects detected | **3,406** (16.4%) |
| Mean # of *defect types* per image | 1.41 |
| Mean # of *total defect instances* per image | 2.71 |
| Max defects in a single image | 26 |

### What `image_path` encodes

```
session_1 / 05142025 / peachtree_corners_GX010224-2025-06-10 / GX010224_time_4_00250.jpg
   │           │                    │                                      │
   │           │                    │                                      └── frame number 00250
   │           │                    └── parent video clip (GoPro file ID + processing date)
   │           └── capture date (MMDDYYYY) → 14 May 2025
   └── ingest session
```

All 20,829 images come from `session_1`. Capture dates split across two driving campaigns:

| Capture window | # images |
|---|---:|
| 14–21 May 2025 | 17,058 |
| 17–19 July 2025 | 3,771 |

### Geographic spread

Bounding box of all 20,829 GPS points:

| | Min | Max | Span |
|---|---|---|---|
| Longitude | -84.273036 | -84.159091 | ~10 km (east–west) |
| Latitude | 33.359410 | 34.002266 | **~71 km** (north–south) |

The east-west range matches Peachtree Corners' actual size. The **71 km north-south range looks wrong** — the city is only ~6 km tall. The low-end latitude `33.36°` (roughly south of Atlanta proper) is almost certainly a handful of bad GPS readings or transit shots. **Plan to filter outliers before plotting.**

### How it joins to the rest of the data

```
locations (2).json            roadSegments (2).json                IMS workbooks
─ 20,829 images               ─ 1,960 segments                     ─ ~1,034 segments
   road_id ─────────────► _id │
                              │ name + From/To                     │
                              └────────────► On Street ────────────► On Street
                                            (fuzzy string match)
```

`road_id` is the only **clean** join — image → segment. Going from segment into the IMS workbooks (where PCI history and rehab plans live) requires a fuzzy text join on street name, since PavePal didn't ingest the city's `GISID`.

### Gotchas / things that will surprise you

1. **`details` is always empty.** Don't waste time on it.
2. **`created_at` is the export time, not the photo time.** All 20,829 rows share `2025-09-26T21:18:43`. Actual photo date lives inside `image_path`.
3. **`road_name` is missing on 3,165 images.** When aggregating defects by road, decide up front whether to drop these or back-fill via the joined `roadSegments` record (through `road_id`).
4. **A "defect" of `manhole covers` isn't a defect** — it's an asset detection. Same with `patching`, `repaired cracks`, `sealing`. Filter dict keys before counting "total defects".
5. **`road_id` resolves to 1,468 unique segments**, almost identical to the 1,467 `"scanned"` segments in `roadSegments (2).json`. So the file is functionally a **scan log of the segments PavePal has driven so far** — not the full network.
6. **No source images, no model confidence scores, no bounding boxes.** The defect counts are a black box you must inherit as ground truth, unless you ask PavePal for more.

---

## `roadSegments (2).json`

**Not a summary of `locations.json`.** This file is two things stitched together:
1. The **city of Peachtree Corners' road inventory** (1,960 segments handed to PavePal — including 493 segments PavePal has not driven yet).
2. **PavePal's scan results** layered on top of the 1,467 segments that have been driven.

The per-segment `defects` field *is* an exact rollup of per-image defects from `locations.json` — verified: 1,960/1,960 segments match the per-image sum perfectly. But the segment list itself, the geometry, and ~25 GIS attribute fields all came from the city before any scanning happened.

### Top-line summary

| Metric | Value |
|---|---:|
| File size | 5.0 MB |
| Top-level structure | GeoJSON `FeatureCollection` of `LineString` features |
| Feature count | **1,960 segments** |
| Scanned by PavePal | **1,467** (75%) |
| Still scheduled | **493** (25%) |
| Total network length | 304.1 km |
| Region | `usa_georgia_peachtree-corners` |
| Source | `"city_provided"` (all 1,960) |
| Export timestamp | `2025-09-26T15:38:38` |

### The two layers

Conceptually, every feature = **`city's road inventory record` ∪ `PavePal scan result`**:

```
┌────────────────────────────────────────────────────────────────┐
│  Layer A — City GIS (always present, all 1,960 segments)       │
│    geometry, name, centerline_id, ROADCLASS, speed_limit,      │
│    FROMLEFT/TOLEFT/FROMRIGHT/TORIGHT, OWNEDBY, MAINTBY,        │
│    ZIPLEFT/ZIPRIGHT, MSAGLEFT/MSAGRIGHT, ESNLEFT/ESNRIGHT,     │
│    QUAD, STREETNAME, length_km, etc.                           │
├────────────────────────────────────────────────────────────────┤
│  Layer B — PavePal scan output (only on the 1,467 "scanned")   │
│    defects (rolled up from locations.json),                    │
│    pci, pci_category, raw_pci                                  │
└────────────────────────────────────────────────────────────────┘
```

The 493 *scheduled* segments have **no `defects`, no `pci`, no `pci_category`, no `raw_pci`** — those keys are entirely absent on those records.

### What one row looks like — a scanned segment

```json
{
  "_id": "68d703322294ad50adb9e400",
  "source": "city_provided",
  "type": "Feature",
  "properties": {
    "name": "PEACHTREE INDUSTRIAL BLVD ACCESS RD",
    "centerline_id": "222121",
    "speed_limit": 55,
    "ROADCLASS": "Major Arterial",
    "ONEWAYDIR": "To-From",
    "MUNILEFT": "NORCROSS", "MUNIRIGHT": "NORCROSS",
    "ZIPLEFT": "30071",     "ZIPRIGHT": "30071",
    "ESNLEFT": "196",       "ESNRIGHT": "196",
    "QUAD": "NW",
    "length_km": 0.0949,
    "scanned": "scanned",
    "defects": { "transverse cracks": 5, "longitudinal cracks": 12 },
    "pci": 82,
    "pci_category": "Very Good",
    "raw_pci": 179.10,
    "type": "road"
  },
  "geometry": { "type": "LineString", "coordinates": [[lon,lat], ...] }
}
```

### Field-by-field reference

#### GeoJSON / DB wrapper

| Field | Type | Meaning |
|---|---|---|
| `_id` | string | Mongo ObjectId — **the join target for `locations.json`'s `road_id`** |
| `source` | string | Always `"city_provided"` |
| `type` | string | Always `"Feature"` |
| `region_id` | string | Always `usa_georgia_peachtree-corners` |
| `created_at` / `updated_at` | ISO datetime | DB write time, not survey time |

#### Layer A — the city's GIS / NG911 attributes (present on all 1,960)

These are standard road-centerline / E-911 fields the city already maintained.

| Field | Meaning |
|---|---|
| `name` | Human street name, e.g. `PEACHTREE INDUSTRIAL BLVD ACCESS RD` |
| `centerline_id` | The **city's** segment ID (6-digit string, e.g. `"222121"`) — NOT the same as IMS's `GISID` |
| `STREETNAME` | An internal street code, e.g. `"RD-69088"` |
| `speed_limit` | mph |
| `ROADCLASS` | Functional class (see distribution below) |
| `ONEWAYDIR` | `null` (two-way), `From-To`, or `To-From`. Only ~12% are one-way |
| `FROMLEFT`, `TOLEFT`, `FROMRIGHT`, `TORIGHT` | Address number ranges on each side of the segment |
| `EVEN_HAND` | Which side has even-numbered addresses (`L` or `R`) |
| `OWNEDBY` / `MAINTBY` | Integer codes (1, 2, -1, -2) — owner/maintainer agency. **Not decoded in the file**; you'd need to ask PavePal or check the city's GIS schema |
| `MUNILEFT` / `MUNIRIGHT` | Municipality (city) on each side, e.g. `PEACHTREE CORNERS`, `NORCROSS` |
| `ZIPLEFT` / `ZIPRIGHT` | ZIP codes |
| `MSAGLEFT` / `MSAGRIGHT` | Master Street Address Guide name (911 dispatch) |
| `ESNLEFT` / `ESNRIGHT` | Emergency Service Number |
| `QUAD` | Quadrant (`NW`/`NE`/`SW`/`SE`) |
| `LAR`, `LAR_DIR` | Local Address Range / direction (sparse, ~12%) |
| `FEDROUTE`, `FEDRTETYPE`, `STROUTE`, `STRTETYPE` | Federal / state highway designations (mostly null) |
| `INWATER` | Always `"No"` |
| `ROADLEVEL` | Mostly 0 (surface); 13 segments are level 1 (likely bridge) |
| `ROW_WIDTH` | Right-of-way width — always 0.0 in this file (not populated) |
| `length` | Segment length in **metres** |
| `length_km` | Same in km |
| `osmid` | OpenStreetMap ID — but every record shows `1000`, so this looks like a placeholder, not real OSM data |

#### Layer B — PavePal's scan layer (only on the 1,467 scanned)

| Field | Meaning |
|---|---|
| `scanned` | `"scanned"` (1,467) or `"scheduled"` (493) |
| `defects` | Sparse dict, same defect taxonomy as `locations.json`. **Verified to equal exactly the sum of per-image defects across that segment's images.** Empty `{}` on 67 of the scanned segments (driven but no defects detected) |
| `pci` | The **displayed** Pavement Condition Index, integer 0–100 |
| `pci_category` | One of `"Excellent"`, `"Very Good"`, `"Good"`, `"Poor"` (no `"Fair"` or `"Marginal"` in this file) |
| `raw_pci` | A pre-clipped intermediate score. Range **0 to 368,922** — clearly *not* on a 0–100 scale. Median 258, mean 727. Looks like accumulated "deduct points" before normalisation. Treat `pci` as the canonical value and `raw_pci` as diagnostic |
| `type` | Always `"road"` (vs `"location"` in `locations.json`) |

### Distributions

#### Road class (Layer A)

| ROADCLASS | # segments |
|---|---:|
| Residential | 1,305 |
| Major Arterial | 499 |
| Private | 70 |
| Highway | 59 |
| Ramp | 25 |
| Minor Arterial | 1 |
| Minor Collector | 1 |

#### PCI (across the 1,467 scanned)

| Stat | Value |
|---|---:|
| Mean | 70.7 |
| Median | 74 |
| Min | 0 |
| Max | 100 |

#### `pci_category`

| Category | Count |
|---|---:|
| Excellent | 435 |
| Very Good | 398 |
| Good | 370 |
| Poor | 264 |

#### Length

| Stat | Value |
|---|---:|
| Total network | 304.1 km |
| Mean segment | 155 m |
| Median segment | 116 m |
| Longest segment | 991 m |

#### Geometry

| Stat | Value |
|---|---:|
| Vertices per LineString (median) | 6 |
| Vertices per LineString (max) | 586 |

#### Spatial bounding box

| | Min | Max | Span |
|---|---|---|---|
| Longitude | -84.276492 | -84.163353 | ~10 km |
| Latitude | **33.917961** | **34.002673** | **~9 km** |

Compare this to `locations.json`'s latitude range (33.36 → 34.00, ~71 km tall). The road segments are **all sensibly inside Peachtree Corners**, which confirms that the wide latitude range in `locations.json` was bad GPS readings. The city's GIS is the trustworthy spatial reference.

### How it joins to other data

```
locations.json    road_id ────────────► _id     roadSegments.json
   (per-image)                          (clean: matches 1,468 segments)

roadSegments.json    centerline_id  ────????──   IMS workbooks (GISID)
                     name + From/To  ────────►   On Street + From/To Street
                                                 (fuzzy text join needed)
```

- **Clean join down from images:** `locations.road_id` → `roadSegments._id`. Done.
- **No clean join up to IMS:** `centerline_id` (e.g. `"222121"`) is the city's ID; IMS's `GISID` (e.g. `"1388"`) is a separate internal ID system. They're not interchangeable. You'll need fuzzy string matching on `name` + cross-street (`FROMLEFT`/`TOLEFT` or street name pairs).

### Gotchas / things that will surprise you

1. **`scanned`/`scheduled` is your data-completeness flag.** Filter to `scanned=="scanned"` before doing any PCI analysis or you'll have 25% of rows with missing values.
2. **`raw_pci` is *not* a 0–100 score** despite the name suggesting it. Use `pci` as the headline number; `raw_pci` is internal.
3. **`OWNEDBY` / `MAINTBY` are integer codes with no decoder in the file.** If you need to know "who is responsible for this road?" you'll have to get the lookup table from PavePal or the city.
4. **`osmid` looks like a placeholder** — every record shows `1000`. Don't try to use it to join to OpenStreetMap.
5. **`ROW_WIDTH` is always 0.0** — not populated.
6. **`pci_category` only uses 4 buckets here** (Excellent / Very Good / Good / Poor). The IMS reports use a 5-category scheme that includes "Fair" and "Marginal". The category labels do **not** align between PavePal and IMS — converting between them is a modelling decision.
7. **`length` is metres, `length_km` is kilometres** — easy to mix up. Use `length_km` consistently.

---

## `relookingforroaddata_2015_baseline/PeachTree_Corners_Analysis_Rev2.xlsx`

### Top-line summary

| Metric | Value |
|---|---|
| File size | 6.4 MB |
| Producer | IMS Infrastructure Management Services |
| What it is | The **engine** behind the 2015 IMS pavement management report — every number in that PDF traces back to this workbook |
| Survey vintage | **All 1,023 segments surveyed on `2015-07-01`** (single survey date, no longitudinal data inside this one file) |
| Network covered | 1,023 segments, 111.3 miles, 1,810,938 yd² of pavement, **all asphalt (ACP)** |
| Decision being made | Pick which segments to rehab, in which year, under a **5-year × $1.5M/yr** budget plan (2016–2020 program) |
| Total decided spend | $7.48M across 5 years (252 segments selected for treatment, ~$30k average) |
| Sheet count | 24 sheets total: **10 data sheets + 14 chartsheets** (pre-rendered plots) |

### The 24 sheets, grouped by purpose

| Group | Sheet | Type | Rows × Cols | What it does |
|---|---|---|---:|---|
| **Deliverables (the 3 appendices in the PDF)** | `App A Inventory` | Data | 1,023 × 50 | The headline output — every segment + its condition + its assigned rehab plan |
| | `App B Rehab by Seg` | Data | 1,023 × 25 | Same 1,023 rows, narrowed to just the rehab decision columns |
| | `App C Rehab by Year` | Data | 254 × 25 | Only segments **selected** for treatment in years 1–5 |
| **Summary / dashboards** | `Summary` | Data | 136 × 15 | Network rollup by FunCL × Pavetype (counts, length, area, PCI, SDI, RI, SI, backlog %) |
| | `Selection Summary` | Data | 43 × 34 | What got selected per year of the plan, broken down by rehab activity |
| | `Equity Removal` | Data | 46 × 12 | Cost-of-doing-nothing vs each budget scenario |
| | `Analysis Results` | Data | 116 × 14 | The multi-scenario master table feeding most chartsheets |
| **Calculation engine** | `Network` | Data | 1,052 × 196 | The wide computation grid driving the appendices |
| | `Ranking Calcs` | Data | 1,433 × 49 | Per-segment priority ranking math |
| | `Age Calcs` | Data | 877 × 39 | Pavement aging projections using performance curves |
| | `Plot Calcs` | Data | 255 × 46 | Data extracted for chartsheets |
| **Decision tables (the rule book)** | `Rehabs` | Data | 179 × 21 | **Map: pavement type + PCI band → rehab activity → unit rate** |
| | `Rates` | Data | 153 × 82 | Base unit prices for individual line items (patching, milling, ACP, etc.) |
| | `Parameters` | Data | 225 × 64 | Distress weighting factors and PCI weighting factors |
| **Charts (rendered plots, no extractable tabular data)** | `Priorities`, `Annual PCI`, `Post Rehab PCI`, `Post Rehab Backlog`, `PCI`, `GFP`, `GFP Comp`, `SI ACP Rehab`, `Rehab`, `Perf Curves` | Chartsheet | — | Pre-rendered images — read the underlying data from `Analysis Results` / `Plot Calcs` instead |

### The most important sheet — `App A Inventory`

This is **1,023 rows × 50 columns**, with the header on **row 8** (rows 1–7 are banner). One row = one road segment (keyed by `GISID`). The columns split into 5 logical blocks:

#### Block 1 — Identification (cols 0–7)

| Col | Field |
|---|---|
| 0 | `GISID` (e.g. `1660`) — **the city's segment primary key** |
| 1, 2 | `Street Number`, `Block Number` |
| 3 | `On Street` (e.g. `ABBY COURT`) |
| 4 | `From Street` |
| 5 | `To Street` |
| 6 | `FunCL` (Functional Classification) |
| 7 | `Pavetype` |

#### Block 2 — Geometry (cols 8–10)

| Col | Field |
|---|---|
| 8 | `Pavement Width (ft)` |
| 9 | `Pavement Length (ft)` |
| 10 | `Pavement Area (yd2)` |

#### Block 3 — Condition assessment (cols 11–32) ← *the meat*

| Col | Field | Meaning |
|---|---|---|
| 11 | `Surface Distress Index (SDI)` | 0–100, derived from visible distresses (cracks, patches, rutting, etc.) |
| 12 | `Roughness Index (RI)` | 0–100, derived from segment roughness (IRI) |
| 13 | `Structural Index (SI)` | 0–100, derived from load-bearing capacity (deflection) |
| 14 | `Pavement Condition Index (PCI)` | **the headline number** — weighted combo: SDI 50% + RI 25% + SI 25% |
| 15 | `PCI Survey Date` | All `2015-07-01` |
| 16 | `Strength Rating` | `Strong` / `Moderate` / `Weak` |
| 17 | `Condition Rating` | 7-bucket: `Excellent` / `Very Good` / `Good` / `Fair` / `Marginal` / `Poor` / `Very Poor` |
| 18 | `Load Associated Deducts` (LAD) | Distress points from load-related distresses (alligator cracking, rutting) |
| 19 | `Non-Load Associated Deducts` (NLAD) | Points from materials/environmental distresses |
| 20, 21 | `PCI Override`, `PCI Override Date` | Manual PCI corrections (mostly empty) |
| 22 | `Current PCI` | PCI aged forward to "current" (analysis) date |
| 23 | `Segment IRI (mm/m)` | International Roughness Index, raw |
| 24 | `Rutting (ACP Only)` | individual distress score |
| 25 | `L&T Cracking / Linear Crk` | Longitudinal & transverse cracking score |
| 26 | `Alligator Cracking` (also covers concrete's `Divided Slab / Blow Up`) | individual distress score |
| 27 | `Map Crk / Crnr Brk / D Crk` | individual distress score |
| 28 | `Edge Cracking` (or concrete `Joint Spall / Sealant`) | individual distress score |
| 29 | `Distortions / Faulting` | individual distress score |
| 30 | `Bleeding / Polished Agg` | individual distress score |
| 31 | `Raveling / Scaling / CAL` | individual distress score |
| 32 | `Patches / Patching` | individual distress score |

#### Block 4 — Project assignment (cols 33–41)

These are about which "Project" (a bundle of contiguous segments) the segment belongs to.

| Col | Field |
|---|---|
| 33 | `Project ID` |
| 34 | `Project Description (Project ID + Street Name)` |
| 35–41 | `Project Block Count`, `Project Length`, `Project Area`, `Project Current PCI`, `Project Strength`, `Project FunCL`, `Project Pavetype` |

#### Block 5 — Rehab decision + cost + outcome (cols 42–49) ← *the recommendation output*

| Col | Field | Meaning |
|---|---|---|
| 42 | `Need Year` | When the segment *should* be rehabbed (1, 2, 3, 4, 5, or `5+`) |
| 43 | `Selected Rehab Year` | When the segment is *actually scheduled* under the $1.5M plan (0 = not selected, 1–5 = year) |
| 44 | `Segment Rehab Results` | Why selected/not selected (e.g. `Critical`, `Non-Critical`, `Not Selected`) |
| 45 | `Rehab Activity Code` | Numeric activity code (5, 10, 20, 30…) |
| 46 | `Rehab Activity` | Activity name (e.g. `FWM + Thick Overlay`) |
| 47 | `Unit Rate ($/yd2)` | $ per square yard for this activity on this road class |
| 48 | `Segment Cost ($)` | Total $ to rehab this segment |
| 49 | `5 Year Post Rehab PCI` | Predicted PCI 5 years after the rehab |

### Key distributions across `App A Inventory`

| Field | Value |
|---|---|
| Total segments | 1,023 |
| Pavement type | ACP (asphalt) — **100%** (zero concrete in this file) |
| FunCL | Residential 907 · Minor Collector 66 · Major Collector 48 · Minor Arterial 2 — **no Major Arterials at all** |
| PCI mean / median / min / max | 63.9 / 63.5 / 16.7 / 96.7 |
| Strength Rating | Moderate 828 · Strong 151 · Weak 44 |
| Condition Rating | Good 246 · Very Good 245 · Fair 209 · Marginal 163 · Excellent 105 · Poor 49 · Very Poor 6 |
| Need Year | Year 1: 247 · Year 2: 42 · Year 3: 174 · Year 4: 204 · Year 5: 186 · 5+: 170 |
| Selected Rehab Year | 0 (not selected): 771 · Yr 1: 60 · Yr 2: 60 · Yr 3: 34 · Yr 4: 54 · Yr 5: 44 |
| Total selected | **252 of 1,023 segments** get money in the 5-year plan |
| Total selected spend | $7.48M (avg ~$30k per segment) |

### The decision logic — `Rehabs` and `Rates`

These two sheets together encode the rule book the chatbot needs to retrieve from.

#### `Rehabs` — PCI band → activity → unit rate (by road class)

```
Code  Activity                          PCI band   $/yd² (varies by FunCL)
 5    Routine Maintenance               85–100     0.00
10    Preventative Maintenance          80–85      0.25 – 0.50
20–26 Surface Treatment / Chip Seal     60–80      3.10 – 5.30
30–36 Edge Mill + Thin Overlay          50–70     10.25 – 16.75
40–46 EM + Moderate Overlay (1.5–3")    40–60     11.75 – 20.00
50–56 FWM + Thick Overlay (>2")         30–50     14.75 – 25.00
60    Surface Recon + Base Rehab        30–40     39.50 – 65.50
70    Full Depth Reconstruction         0–30      47.00 – 79.00
510–570  PCC equivalents (concrete)     —         —
```

For each activity, six unit rates are given depending on functional class:

| Column | Decoded |
|---|---|
| `MIA Unit Rate` | Minor Arterial |
| `MJC Unit Rate` | Major Collector |
| `MIC Unit Rate` | Minor Collector |
| `RSS Unit Rate` | Residential |
| `FunCL 5 Unit Rate` | (custom class) |
| `FunCL 6 Unit Rate` | (custom class) |
| `Burden (%)` | Overhead — fixed at 25% |
| `Reset PCI` | What PCI the segment "resets" to after this rehab |

#### `Rates` — the underlying line-item prices

The base prices that drive everything in `Rehabs`. Examples (per yd² unless noted):

| Item | Activity | Rate | Units |
|---|---|---|---|
| 1 | Patching | $25 | yd² |
| 2 | Surface Preparation | $0.25 | yd² |
| 3 | Crack Sealing | $2,500 | Lane-mile |
| 5 | Edge Milling/Grinding | $5 | yd² |
| 6 | Full Width Milling | $3.50 | yd² |
| 12 | Granular Base Course | $55 | Ton |
| 15 | Asphalt Supply & Install | $85 | Ton |
| (152 rows total) | | | |

This is your "what-does-each-unit-cost" reference.

### How PCI is computed — `Parameters` sheet

The PCI weighting:

| Index | Weight |
|---|---:|
| SDI | 50% |
| RI | 25% |
| SI | 25% |

The SDI itself is a weighted sum across 8 distress types (the priority factor table on rows 11–14). For ACP:

| Distress | Weight |
|---|---:|
| Rutting | 9.5 |
| L&T Cracking | 8 |
| Alligator Cracking | 10 |
| Map Crack / Corner Break | 5.5 |
| Edge Cracking | 4.5 |
| Distortions / Faulting | 7 |
| Bleeding / Polished Agg | 4.5 |
| Raveling / Scaling / CAL | 5.5 |
| Patches / Patching | 8 |

### The budget-scenario engine — `Analysis Results` + `Equity Removal`

`Analysis Results` runs the same network through 10 different annual budgets and reports year-by-year PCI evolution:

| Annual budget | 2015 PCI | 2020 PCI | Backlog 2020 |
|---|---:|---:|---:|
| Do Nothing ($0) | 63.0 | **53.6** | 27.1% |
| $100k | 63.0 | 54.6 | 25.9% |
| $250k | 63.0 | 56.0 | 24.0% |
| $500k | 63.0 | 58.3 | 20.9% |
| $750k | 63.0 | 60.4 | 17.9% |
| $1.0M | 63.0 | 62.7 | 16.0% |
| $1.25M | 63.0 | 65.1 | 13.4% |
| **$1.50M (chosen)** | 63.0 | **67.5** | 11.1% |
| $1.75M | 63.0 | 69.8 | 9.0% |
| $2.0M | 63.0 | 72.1 | 6.9% |

`Equity Removal` reframes those numbers as **"what's the real cost if we pretend we did nothing?"** — i.e. the cost of restoring the network back to today's PCI five years from now. Spend less today → pay more later.

### How to read this file in Python

```python
import pandas as pd
df_app_a = pd.read_excel(
    'PeachTree_Corners_Analysis_Rev2.xlsx',
    sheet_name='App A Inventory',
    header=7,         # the actual header row (rows 0-6 are banner)
    skiprows=[8],     # row 8 is blank between header and data
)
```

Same pattern works for `App B Rehab by Seg` and `App C Rehab by Year`.

### Gotchas / things that will surprise you

1. **`PCI Survey Date` is identical for every row** (`2015-07-01`). This file has *no* longitudinal data — comparing 2015 vs 2022 requires joining to `Neighborhood PCI Averages 2023.xlsx`, which has the historic columns embedded.
2. **No Major Arterials, no Highways.** This 2015 file only covers Residential and Collector roads. By contrast `roadSegments.json` has 499 Major Arterials and 59 Highways. The IMS 2015 study scope is narrower than PavePal's network.
3. **All asphalt, no concrete.** All 1,023 segments are ACP. The `Rehabs` sheet *does* list concrete (PCC) activities (codes 510–570), but no segment uses them.
4. **14 of the 24 sheets are chartsheets** — `openpyxl` will throw `'Chartsheet' object has no attribute 'iter_rows'` if you try to iterate them. Filter via `wb[name].sheet_state` or use `try/except` when scanning all sheets.
5. **Header row is row 8 (1-indexed) on App A and row 8 on App B/C** — rows 1–7 are banner/copyright. Set `header=7` (0-indexed) when using pandas.
6. **`Condition Rating` here uses 7 buckets** (Very Poor → Excellent), but `roadSegments.json`'s `pci_category` only uses 4 (Poor/Good/Very Good/Excellent), and the GDOT/IMS 5-bucket GFP scheme is different again. **Three incompatible category systems** — flag this in any cross-source recommendation.
7. **Cost data is 2015 dollars.** Do not directly use these unit rates for 2026 cost estimates — for current pricing, defer to the 2024 Bid Tabulation PDF.
8. **`Selected Rehab Year = 0`** does NOT mean "rehab in year 0" — it means "**not selected** under the $1.5M plan." The plan years are 1–5 (= 2016–2020).
9. **`raw` data lives in `Network`** (1,052 × 196), but it's a side-by-side computation grid where columns drift in meaning across sub-blocks. Don't try to load it as a flat tidy table — read the appendices instead.
10. **The chartsheets are images** — don't try to extract data from them. The data feeding each chart is in `Analysis Results` or `Plot Calcs`.

---

## `relookingforroaddata_2015_baseline/PeachtreeCorners_byGISID_Rev2.xlsx`

### Top-line summary

| Metric | Value |
|---|---|
| File size | 7.6 MB |
| Producer | IMS Infrastructure Management Services |
| What it is | The **show-your-work** companion to `PeachTree_Corners_Analysis_Rev2.xlsx` — same 1,023 segments, but every intermediate calculation step is exposed, plus reference tables and cost-justification math |
| Survey vintage | Same 2015 survey as the other workbook |
| Sheet count | 26 sheets (14 data + 12 chartsheets) |
| Headline sheet | `ACP` — 1,046 rows × **399 columns** (the full per-segment condition computation pipeline) |

### How this file differs from `PeachTree_Corners_Analysis_Rev2.xlsx`

Same network, same survey — but a different lens. Side-by-side:

| Aspect | `Analysis_Rev2.xlsx` | `byGISID_Rev2.xlsx` |
|---|---|---|
| Primary purpose | "Here is what we **recommend doing**" | "Here is **how we computed those numbers**" |
| Main sheet | `App A Inventory` (50 cols, finished output) | `ACP` (399 cols, full calculation pipeline) |
| 5-year rehab budget plan | ✅ Yes ($1.5M plan, per-year selections) | ❌ No |
| Life-cycle cost justification | Indirect (via `Equity Removal`) | ✅ Direct (`Comps` sheet — 3 independent estimates) |
| Acronym glossary | ❌ No | ✅ Yes (~70 terms) |
| Per-class priority weights | Implicit | ✅ Explicit (`PWF` sheet) |
| Workbook TOC | ❌ No | ✅ Yes (`TABS` sheet, every other tab is described) |
| "Not surveyed" exceptions | ❌ No | ✅ Yes (9 segments, with reason codes) |
| Rehab activity names | Detailed (e.g. `Edge Mill + Thin Overlay`) | Simpler (e.g. `Thin Overlay (1.5 - 2.0)`) |

If you can only open one of the two for understanding, open `Analysis_Rev2.xlsx`. If you need to cite *how* a number was derived, open this one.

### The 26 sheets, grouped by purpose

| Group | Sheet | Type | Rows × Cols | What it does |
|---|---|---|---:|---|
| **Reference / docs** | `TABS` | Data | 73 × 3 | Self-documenting workbook TOC — describes what each other tab contains |
| | `Acronyms` | Data | 82 × 6 | The ~70-entry pavement-engineering acronym glossary |
| **Network rollups** | `SumFunCL` | Data | 68 × 24 | Network stats by detailed FunCL (MIA/MJC/MIC/RSS/FunCL5–8) × Pavetype |
| | `SumGroup` | Data | 68 × 20 | Same stats grouped into ART/COL/RES (3 buckets instead of 8) |
| | `Comps` | Data | 59 × 18 | **Life-cycle cost analysis — 3 independent estimates of annual asphalt cost, all converging at ~$1.3–1.5M/yr** |
| **Per-segment data** | `ACP` | Data | 1,046 × **399** | The full asphalt segment condition pipeline (see below) |
| | `PCC` | Data | 117 × 331 | Concrete-segment equivalent — empty in this dataset (no concrete) |
| | `No Survey` | Data | 30 × 25 | The 9 segments NOT surveyed, with reasons |
| **Decision tables** | `Rehabs` | Data | 182 × 52 | PCI band → rehab activity → unit rate (with finer LADD/RI/SI bounds than `Analysis_Rev2`) |
| | `Rates` | Data | 156 × 82 | Underlying line-item unit prices (similar to the other workbook) |
| | `PWF` | Data | 42 × 14 | **Priority Weighting Factor** — road class × strength × pavement type → priority score |
| **Calculation engines** | `Curve Calcs` | Data | 878 × 41 | Performance curve calculations |
| | `Plot Calcs` | Data | 455 × 64 | Data extracted for chartsheets |
| | `Q Calcs` | Data | 2,038 × 34 | "Quality" / aging calculations |
| **Charts (no extractable data)** | `COND`, `GFP`, `GFP FunGRP`, `XX`, `SDI-RI`, `GFP Defn`, `LADD`, `FunCL`, `FunGRP`, `$ Plot`, `ACP Rehab`, `Perf Curves` | Chartsheet | — | 12 pre-rendered plots |

### The headline reference card — Condition Rating Codes (top of `ACP`, rows 5–12)

This is **the most useful reference table in the whole workbook** — the exact mapping between numeric code, PCI, and the verbal GFP label:

| Code | PCI | GFP Label | (Plain English) |
|---:|---:|---|---|
| 1 | 25 | Very Poor | Rated Light |
| 2 | 35 | Poor | Rated Slightly Light |
| 3 | 45 | Marginal | Rated Within Tolerance |
| 4 | 55 | Fair | Rated Slightly Heavy |
| 5 | 65 | Good | Rated Heavy |
| 6 | 77.5 | Very Good | Rehabbed - Set to 95 |
| 7 | 92.5 | Excellent | Rehabbed - Set to 90 |
| 8 | 100 | — | (above scale) |

**Use this when translating between the three category systems** (PavePal's 4-bucket, IMS's 7-bucket, GDOT's 5-bucket GFP).

### The `ACP` sheet — 1,023 segments × 399 columns

The header lives on **row 19** (rows 1–18 are banner + the condition codes panel above + section headers). The 399 columns aren't 399 distinct fields — they're **the same set of distress fields repeated across ~7 sequential calculation stages** of the pipeline. Logical bands:

#### Band 1 — Identification + final scores (cols 0–13)

| Col | Field | Note |
|---|---|---|
| 0 | `GISID` | The city's segment primary key |
| 1 | `Agency ID` | City's separate ID |
| 2 | `Data Processing Comment` | Free-text notes |
| 3–5 | `Calc 1 SDI`, `Calc 1 RI`, `Calc 1 SI` | First-pass index scores |
| 6, 7 | `2009 Previous SDI`, `2009 Previous RI` | **Placeholder columns — empty in this dataset** |
| 8 | `Surface Distress Index (SDI)` | The published SDI (0–100) |
| 9 | `Roughness Index (RI)` | The published RI (0–100) |
| 10 | `Structural Index (SI)` | Empty here; SI is in cols 261, 365 |
| 11 | `Calc 1 PCI` | First-pass PCI |
| 12 | `2009 Previous PCI` | **Empty — placeholder for trending** |
| 13 | `Pavement Condition Index (PCI)` | **The final published PCI** |

#### Band 2 — Manual review / overrides (cols 14–18)

| Col | Field |
|---|---|
| 14 | `O/R Condition Rating Code` (manual override) |
| 15 | `Review Condition SDI` (manual override) |
| 16 | `GFP Review Code Selection` |
| 17 | `SDI/PCI Review and Override` |
| 18 | `Condition Review Comment` |

#### Band 3 — Street identification (cols 19–31)

`Street Number`, `Block Number`, `SOBJ`, `Street Prefix`, `On Street`, `From Street`, `To Street`, `Agency FunCL Code`, `Agency Functional Class`, `Model Functional Class`, `Pavemennt Type` *(sic — typo in source)*, `Owner`.

#### Band 4 — Geometry / survey metadata (cols 32–44)

`Agency Width (ft)`, `Check Width`, `Pavement Width`, `Survey Passes`, `Object Length`, `Check Length`, `GIS Length`, `Pavement Length (ft)`, `Pavement Area (ft2)`, `Pavement Length Flag`, `Sample Width`, `Sample Length`, `Sample Area`.

#### Band 5 — RAW measured distresses (cols 45–116) — the input to the whole pipeline

This is where the **actual field measurements** live. Examples:

- `LRUT Depth (mm)` / `RRUT Depth (mm)` / `TRUT Depth (mm)` — left/right/total rut depths
- `Rutting_12` × 3, `Rutting_20` × 3 — rut measurements at different reference widths
- `Transverse Cracking_12` × 3, `Transverse Cracking_20` × 3
- `LCrk Density (Sum LCrk/Sample Area)`, `TCrk Percentage of LCrk`, `TCrk From Sealed TCrks`, `Acrk % from LCrk`, `ACrk From LCrk`
- `Longitudinal Cracking` × 6 — at 6 different processing stages
- `Alligator Cracking` × 9 — at 9 different processing stages
- `Block Cracking` × 3, `Edge Cracking` × 6, `Distortions (Shoving)` × 6, `Bleeding` × 3, `Raveling` × 9 (incl. `RAV from Texture/Roughness`), `Patching` × 6, `Pothole` × 3

The **column-name duplication is intentional** — each repetition is the same distress at a different stage of the calculation. Treat this as a per-stage trace, not a tidy table.

#### Band 6 — Deduct value computation (cols 213–251)

The **PCI calculation engine** itself, exposing the ASTM D6433 method step-by-step:

| Cols | Field |
|---|---|
| 213 | `Distress Counter` |
| 214 | `M = Max Deducts` |
| 215, 216 | `Truncated M`, `Remainder M` |
| 217–226 | `D1`–`D10` (top 10 individual deduct values) |
| 227 | `TDV` (Total Deduct Value) |
| 228 | `N - Active Cells > 0` |
| 229–238 | `TDV1`–`TDV10` (running total deduct values) |
| 239–248 | `CDV1`–`CDV10` (Corrected Deduct Values) |
| 249 | `Max CDV` |
| 250 | `Sum of All Deducts or 1` |
| 251 | `Surface Distress Index (SDI)` ← **PCI = 100 − Max CDV (effectively)** |

This is the only place in your data that *shows the PCI math being performed*. Useful if a chatbot user asks "why is this segment's PCI 63?".

#### Band 7 — Roughness + structural calculation (cols 252–265)

`IRI_Left`, `IRI_Right`, `IRI_Segment` (mm/m), `Uncorrected Roughness`, `RI Micro/Macro Texture Check`, `DeflCON10/100`, `DynaCON10/100`, `Structural Index (Deflection Based)`, `Structural Rating Code`, `Structural Rating`, `Structural Index Type`.

#### Band 8 — Performance-curve aging (cols 320–338)

The pavement-decay forecasting:

| Col | Field |
|---|---|
| 320 | `Current Curve Selection` |
| 321 | `Previous Estimated SDI100 Age` |
| 322 | `Current Estimated SDI 100 Age` |
| 323 | `Predicted Aged SDI` |
| 324 | `Current RI (Forward)` |
| 325 | `Calc1 SDI (Forwarded)` |
| 326–330 | `Slightly Low / Low / Predicted / High / Slightly High Predicted SDI` |
| 331–333 | `Rating Condition Code`, `…(Rehabs)`, `Rating Condition` |
| 334–338 | `L1 / L2 / L3` regression terms, `Target SDI - move towards center`, `Target SDI - Clip`, `Target SDI With Review and Override` |

#### Band 9 — Final published values + fix-all rehab (cols 363–387)

| Col | Field |
|---|---|
| 363–366 | Final `SDI`, `RI`, `SI`, `PCI` |
| 367–368 | `Structural Rating Code`, `Structural Rating` |
| 369 | `Condition Rating` |
| 370, 371 | `Load Associated Deducts` (LADD), `Non-Load Associated Deducts` (NLAD) |
| 372 | `Segment IRI (mm/m)` |
| 373–382 | Per-distress final scores |
| 383 | `Fix All Rehabilitation Activity` (recommended) |
| 384 | `Unit Rate ($/yd2)` |
| 385 | `Fix All Rehabilitation Cost ($)` |
| 386, 387 | `Fix All Life Cycle (yrs)`, `Fix All Life Cycle Cost ($/yr)` |

These last 5 columns are the **per-segment "what would it cost to fix everything?"** numbers — a different costing lens than the budget-constrained plan in `Analysis_Rev2`.

### Reference table — `PWF` (Priority Weighting Factor)

This is **how priorities are assigned** when ranking segments for the budget-constrained plan. A road class × pavement-strength × pavement-type lookup:

| FunCL | ACP Weak | ACP Mod | ACP Strong | PCC Weak | PCC Mod | PCC Strong | Composite Weak/Mod/Strong |
|---|---:|---:|---:|---:|---:|---:|---:|
| Minor Arterial | 100 | 95 | 90 | 90 | 85 | 80 | 95 / 90 / 85 |
| Major Collector | 85 | 80 | 75 | 75 | 70 | 65 | 80 / 75 / 70 |
| Minor Collector | 75 | 70 | 65 | 65 | 60 | 55 | 70 / 65 / 60 |
| Residential | 60 | 55 | 50 | 50 | 45 | 40 | 55 / 50 / 45 |
| FunCL 5 / 6 / 7 / 8 | 50 | 45 | 40 | 40 | 35 | 30 | 45 / 40 / 35 |

**Reading it:** a Minor Arterial that's structurally weak gets the highest priority (100); a Residential that's structurally strong gets the lowest (50). Higher numbers = repaired sooner.

### Reference table — life-cycle cost (`Comps` sheet)

The justification for the chosen $1.5M annual budget. Three independent estimation methods all converge:

| Method | Logic | Annual cost ($/yr) |
|---|---|---:|
| #1 Current Deficiency | Sum of $ to fix every deficient segment ÷ life cycle | $1,326,000 |
| #2 Network Value | $84.85M total asphalt asset ÷ 65-yr life span | $1,310,000 |
| #3 Current Conditions | Network PCI 63 → "Thin Overlay" typical → 7.4 mi/yr × $200k/mi | $1,480,000 |

### The `No Survey` sheet — segments deliberately skipped

9 segments in the city's GIS but not surveyed. Reasons documented:

| Reason | Count |
|---|---:|
| Very Small Segment | 5 |
| Brick Per RST Crew (not asphalt) | 2 |
| Impassable Per RST Crew | 1 |
| Gated Per RST Crew | 1 |

If you ever need to explain "why isn't road X in the report?" — start here.

### How to read this file in Python

```python
import pandas as pd
df_acp = pd.read_excel(
    'PeachtreeCorners_byGISID_Rev2.xlsx',
    sheet_name='ACP',
    header=19,        # row 19 is the GISID header (rows 0-18 are banner/codes panel)
    skiprows=[20],    # row 20 may be blank / units row
)
# The 399 columns will have many duplicate names — pandas auto-suffixes them as
# "Longitudinal Cracking", "Longitudinal Cracking.1", "Longitudinal Cracking.2", etc.
```

### Gotchas

1. **`2009 Previous PCI/SDI/RI` columns are placeholders** — they exist in the schema but are empty. **No actual 2009 historical data is in this file**, despite the column names. (For real 2015→2022 trending, use `Neighborhood PCI Averages 2023.xlsx`.)
2. **The 399 ACP columns include MANY duplicate column names** — same distress repeated across 7+ pipeline stages. Pandas will auto-suffix; don't assume `Longitudinal Cracking.6` means "6th lane" — it means "6th calculation stage."
3. **`Pavemennt Type`** (col 30) — typo in the source. Don't fix it on read; just be aware.
4. **`Structural Index` is empty in col 10** for most rows — the real SI is in col 261 and col 365 (later in the pipeline).
5. **Rehab activity names differ** between this file's `Rehabs` sheet and `Analysis_Rev2.xlsx`'s `Rehabs` sheet. They are the *same activities* but labeled differently. Cross-walk before comparing:
   - `Slurry Seal` ↔ `Preventative Maintenance`
   - `Surface Treatment` ↔ `Surface Treatment / Chip Seal`
   - `Thin Overlay (1.5–2.0)` ↔ `Edge Mill + Thin Overlay`
   - `Mod Overlay (2.0–3.0)` ↔ `EM + Moderate Overlay`
   - `Thick Olay (>2.0–3.0)` ↔ `FWM + Thick Overlay`
   - `Reconstruction (Surface)` ↔ `Surface Recon + Base Rehab`
   - `Reconstruction (Base)` ↔ `Full Depth Reconstruction`
6. **`Slurry Seal` unit rates differ between the two workbooks**: $0.25–0.50/yd² in `Analysis_Rev2`'s `Rehabs`, but $2.30–2.60/yd² here. They're using the same line-item prices in `Rates` but blending them differently into activity unit rates. **Don't quote one workbook's unit rates next to the other's.**
7. **The `PCC` sheet exists but is mostly empty** — there's no concrete pavement in Peachtree Corners, but the workbook template carries the sheet anyway.
8. **The condition codes panel sits in the *top-left of the ACP sheet*** (rows 3–12), NOT in the Acronyms sheet. Easy to miss.
9. **12 of the 26 sheets are chartsheets** — same `iter_rows()` failure pattern as the other workbook.

---

## `relookingforroaddata_2015_baseline/PeachtreeCornersGA_AnalysisRev2.kmz`

### What it is

A **Google Earth map** of the 2015 IMS pavement analysis. Internally a `.kmz` is just a ZIP archive — this one contains a single `doc.kml` (XML, ~6.7 MB unzipped). The header comment says it was *"Exported from Rev2_ACP on 8/10/2015"*, meaning it was generated directly from the `ACP` sheet of `PeachtreeCorners_byGISID_Rev2.xlsx`.

Think of it as the **non-technical, sponsor-friendly version** of the data — the kind of artifact a public-works director would show at a city-council meeting. Every byte of data in it duplicates what's already in the `byGISID` workbook; it just adds the *spatial* dimension (real road geometries, color-coded, clickable).

### What's inside

3,114 placemarks total, organized into Google Earth folders:

| Folder | Geometry | Count | Purpose |
|---|---|---:|---|
| `Pavement Condition Index (PCI)` (7 sub-folders, one per PCI bucket) | LineString | **1,023** | The road segments themselves, color-coded red → green by PCI |
| `Feature Labels (GISID)` | Point | 1,023 | Text labels showing the GISID over each segment |
| `Endnode` | Point | 1,067 | Segment from/to endpoints |
| `City Boundary` | Polygon | 1 | The Peachtree Corners outline |

The 7 PCI buckets are: `0–30 Very Poor (red)` (8), `31–40 Poor` (52), `41–50 Marginal` (168), `51–60 Fair (yellow)` (210), `61–70 Good` (247), `71–85 Very Good` (234), `86–100 Excellent (green)` (104) — totaling 1,023, matching the workbook.

Each LineString placemark carries **80 attribute fields** (slugified versions of the `ACP` sheet's columns: `GISID`, `On_Street`, `Pavement_Width_ft`, `LRUT_Depth_mm`, `Alligator_Cracking_Lo/Mod/Hi`, …, `Fix_All_Rehabilitation_Activity`, `Unit_Rate_yd2`, `Fix_All_Life_Cycle_Cost_yr`). Click a segment in Google Earth and a popup shows all of them.

### How to actually use it

- **Open it visually:** double-click in Finder → opens in Google Earth Pro. Best for a quick "where are the bad roads?" sanity check.
- **Read it programmatically:** `geopandas.read_file('…kmz', driver='KML')` or unzip and parse `doc.kml` as XML.
- **Convert to a modern format:** `ogr2ogr -f GeoJSON segments_2015.geojson PeachtreeCornersGA_AnalysisRev2.kmz`.

### When you'd actually need it

| Use | Verdict |
|---|---|
| Visual sanity check / quick map for a presentation | ✅ Useful |
| Spatial source for joining with PavePal's GeoJSONs | ⚠️ Use the **2022 ArcGIS shapefile** in the `2023_update` folder instead — it's newer and a more standard format |
| Feeding into your RAG pipeline | ❌ Skip — KML is a visualization format, not a knowledge source |

### Gotchas

1. **PCI bucket boundaries here differ slightly from the workbook's code-to-PCI mapping.** The KMZ uses *ranges* (`0–30`, `31–40`, …); `byGISID_Rev2.xlsx`'s code panel uses *anchor points* (Code 1 = PCI 25, Code 2 = PCI 35, …). Category names match; only the way of expressing the boundaries differs.
2. **Field names are slugified** (`Pavement_Width_ft`, `Fix_All_Life_Cycle_yrs`) and the workbook's typo `Pavemennt_Type` is preserved as-is.
3. **No new information.** Don't waste time mining this for unique values — it's a redundant copy of the `ACP` sheet, plus a city boundary polygon.
