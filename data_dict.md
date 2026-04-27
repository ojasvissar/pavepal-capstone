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
