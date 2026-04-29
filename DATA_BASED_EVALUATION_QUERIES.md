# 📊 Data-Based Evaluation Queries for PavePal RAG

These queries are grounded in your **actual data** from the project folder. Each query tests specific data sources and retrieval quality.

---

## **Category A: Inspection Data Queries** 
*Testing retrieval of locations.json and roadSegments.json*

### Query 1
```
How many inspection locations were captured in total, and what is the most common defect type found?
```
**Expected Data Points:**
- 20,829 total inspection locations
- Most common: longitudinal cracks (29,277 occurrences)
- Should cite: [inspection-data], [data-summary]

**Failure Mode Test:** Does it hallucinate the numbers? Can it verify from data?

---

### Query 2
```
What percentage of the 1,960 road segments have been scanned versus scheduled?
```
**Expected Data Points:**
- Scanned: 1,467 segments (75%)
- Scheduled: 493 segments (25%)
- Should cite: [road-infrastructure], [inspection-data]

**Grounding Test:** Is the math correct? Does it verify against actual data?

---

### Query 3
```
List the defect types detected and which one appears least frequently.
```
**Expected Defect List:**
- Longitudinal cracks: 29,277
- Transverse cracks: 18,760
- Block cracks: 3,709
- Alligator cracks: 2,812
- Manhole covers: 1,286
- Potholes: 604
- Patching: 28
- Repaired cracks: 11
- **Sealing: 1** (least frequent)

**Accuracy Test:** Can it pull the exact taxonomy and counts?

---

### Query 4
```
Tell me about the inspection capture sessions - when were the road images taken?
```
**Expected Data Points:**
- Session 1: May 14–21, 2025 (~17,576 images)
- Session 2: July 17–19, 2025 (~3,771 images)
- Encoding: dates in image_path field
- Should cite: [inspection-data]

**Timeline Test:** Does it correctly extract temporal information from nested JSON?

---

### Query 5
```
How many inspection locations have zero defects detected?
```
**Expected Answer:**
- 3,406 of 20,829 images have no defects (approximately 16%)
- These are useful as negative class examples

**Edge Case Test:** Can it identify and count empty/null values?

---

## **Category B: Road Infrastructure Queries**
*Testing retrieval of roadSegments.json properties*

### Query 6
```
What are the main road classes found in Peachtree Corners, and which is most common?
```
**Expected Data Points:**
- Residential: 1,305 segments (most common)
- Major Arterial: 499 segments
- Private: 70 segments
- Highway: 59 segments
- Ramp: 25 segments
- Minor Arterial: 1 segment
- Minor Collector: 1 segment

**Classification Test:** Does it correctly summarize categorical data?

---

### Query 7
```
What information is captured for each road segment beyond PCI scores?
```
**Expected Answer Should Include:**
- Speed limits
- Ownership and maintenance info
- Municipal boundaries
- Road name and centerline ID
- Geographic coordinates
- Length in kilometers
- Scanning status
- GIS attributes (FROMLEFT, TORIGHT, etc.)

**Completeness Test:** Does it understand the full data model?

---

### Query 8
```
Which segments are still scheduled for scanning and have not yet been surveyed?
```
**Expected Data Point:**
- 493 segments marked as "scheduled" (not "scanned")
- These segments don't have PCI scores yet

**Filter Test:** Can it distinguish between scanned vs. scheduled status?

---

## **Category C: PCI & Treatment Mapping Queries**
*Testing Rehab Activities table integration*

### Query 9
```
I have a segment with PCI 75. What treatment should it get and what's the cost per square yard?
```
**Expected Answer:**
- PCI band: 70-80 (Fair condition)
- Treatment: Slurry Seal / Seal Coat
- Cost: $2.25/yd²
- Rationale: Preventive maintenance to slow oxidation
- Should cite: [rehab-asphalt-slurry-seal], [gdot-pci-thresholds]

**Critical Test:** This is the core "decision support" query. Does it get the right band and cost?

---

### Query 10
```
A segment has PCI 55 and we need the cheapest acceptable repair. What are the options?
```
**Expected Answer:**
- PCI band: 50-60 (Marginal condition)
- Recommended: Mill + Moderate Overlay
- Cost: $18.25/yd²
- Why: At this PCI, surface sealing won't work; structural treatment needed
- Should cite: [rehab-asphalt-moderate-overlay], [gdot-pci-thresholds]

**Failure Mode Test:** Does it hallucinate a cheaper option that won't work for this PCI?

---

### Query 11
```
What treatments are available for PCI 65 condition, and rank them by cost?
```
**Expected Answer:**
- PCI band: 60-70 (Satisfactory)
- Option 1: MicroSurface @ $3.10/yd² ← cheapest
- Option 2: Thin Overlay @ $40.29/yd²
- Why two options? Different traffic/durability needs
- Should cite: [rehab-asphalt-microsurface], [rehab-asphalt-thin-overlay]

**Optimization Test:** Can it compare multiple options at same PCI level?

---

### Query 12
```
At what PCI threshold does reconstruction become necessary?
```
**Expected Answer:**
- Reconstruction needed: PCI < 40 (Very Poor condition)
- Cost range: $80–$85+/yd²
- Why: Below 40, other treatments will fail
- Above 40: Rehabilitation still viable
- Should cite: [gdot-pci-thresholds], [rehab-asphalt-reconstruction]

**Boundary Test:** Does it correctly identify the critical PCI threshold?

---

## **Category D: GDOT Engineering Guidance Queries**
*Testing Pavement Preservation Guide integration*

### Query 13
```
Explain the GDOT preservation philosophy and why timing matters.
```
**Expected Answer Should Include:**
- Treatments most cost-effective when applied EARLY
- Typical preservation: $2–$45/yd²
- Reconstruction if delayed: >$80/yd²
- Economic benefit of early treatment: 3–5x
- Window: Apply between PCI 70→65 or 60→55 (sweet spot)
- Should cite: [gdot-preservation-philosophy], [gdot-timing-optimization]

**Authority Test:** Does it recognize GDOT as authoritative source?

---

### Query 14
```
What does GDOT say about block cracks and alligator cracks?
```
**Expected Answer:**
- Both indicate NETWORK PATTERN of damage
- Severity: Network = structural failure (not surface)
- Treatment: Preservation will FAIL; reconstruction only option
- Why: Root cause is subgrade/base failure
- Should cite: [gdot-defect-severity], [defect-classification]

**Warning Signal Test:** Does it properly flag critical defects?

---

### Query 15
```
What are the construction specifications for chip seal according to GDOT?
```
**Expected Answer Should Cover:**
- Aggregate gradation: Must meet GDOT spec 341-5
- Tack coat: Ensure proper emulsion rate
- Temperature: Apply only 50–90°F in dry conditions
- Cure time: 24 hours before traffic
- Quality: No fat spots, even color, proper texture
- Should cite: [gdot-construction-specs]

**Technical Depth Test:** Can it retrieve detailed specifications?

---

## **Category E: Cost & Bidding Queries**
*Testing 2024 contractor pricing integration*

### Query 16
```
What do contractors charge to mill asphalt pavement, and what's the price range?
```
**Expected Answer:**
- 2024 Bid Data (PTC 24-05):
  - Low: $2.38/yd²
  - High: $8.10/yd²
  - **Variation: 240%** (significant!)
- Why the spread? Equipment costs, labor availability, schedule
- Should cite: [bid-data-milling]

**Market Reality Test:** Does it show real-world price variation?

---

### Query 17
```
How much does it cost to adjust a manhole to grade in 2024?
```
**Expected Answer:**
- 2024 Bid Data shows:
  - Low: $185 per manhole
  - High: $1,850 per manhole
  - **Variation: 900%!!**
- High variation = significant risk in cost estimation
- Should cite: [bid-data-overview]

**Risk Assessment Test:** Does it identify high-uncertainty items?

---

### Query 18
```
If we need to overlay 10,000 square yards of asphalt, what's our budget range?
```
**Expected Calculation:**
- Dense Grade Asphalt Overlay (2"):
  - Low: $45/yd² × 10,000 = $450,000
  - High: $78/yd² × 10,000 = $780,000
  - **Range: $330,000 variation**
- Should cite actual 2024 bid data

**Calculation Test:** Can it do math with retrieved pricing?

---

## **Category F: IMS Report Queries**
*Testing integration of 2023 & 2015 pavement management data*

### Query 19
```
What is Peachtree Corners' 5-year rehabilitation budget according to the latest plan?
```
**Expected Answer:**
- 2023 IMS Report:
  - Annual: $3.506M
  - 5-year total: ~$17.53M
- Network: 304.1 km of public roads
- Coverage: ~7,500 segments analyzed
- Should cite: [ims-2023-rehab-program]

**Budget Reality Test:** Does it cite authoritative planning documents?

---

### Query 20
```
How should the rehabilitation budget be allocated across treatment types?
```
**Expected Answer (from IMS 2023):**
- Seal coat / preventive: 20–25% of segments
- Mill and overlay: 50–60% of segments
- Full reconstruction: 10–15% of segments
- Deferred to future: Remaining segments
- Strategy: Year 1 = critical (PCI < 50), Years 2–3 = fair (PCI 50–70)
- Should cite: [ims-2023-rehab-program]

**Strategy Test:** Can it explain the maintenance hierarchy?

---

### Query 21
```
Compare the 2015 baseline survey to the 2023 update - what changed in how the analysis was done?
```
**Expected Answer:**
- **2015 Survey (Baseline):**
  - 1,034 segments analyzed
  - Survey date: July 1, 2015
  - $1.5M annual rehab scenario
  
- **2023 Update (Current):**
  - ~7,500 segments analyzed (7x more detailed!)
  - 50-sheet workbook vs. 24-sheet
  - $3.506M annual budget (2.3x larger)
  - More sophisticated analysis (5-year plan, neighborhood rollups)

**Trend Analysis Test:** Can it track improvement in data quality?

---

### Query 22
```
What was the survey methodology used for the 2023 pavement condition assessment?
```
**Expected Answer Should Mention:**
- Automated pavement condition collection via surface imaging
- Visual field verification
- Defect inventory by location and type
- PCI calculation per ASTM D6433 standard
- Should cite: [ims-2023-methodology]

**Standards Alignment Test:** Does it recognize formal standards?

---

## **Category G: Multi-Source Grounding Queries**
*Testing integration across multiple data sources*

### Query 23
```
I found 15 segments with block cracks (PCI 35). Walk me through the decision chain from data to recommendation.
```
**Expected Answer (Should Cite Chain):**
1. **Data Layer:** 15 segments detected with block cracks in [inspection-data]
2. **Defect Layer:** Block cracks = network pattern [defect-classification]
3. **GDOT Layer:** Network pattern = structural failure [gdot-defect-severity]
4. **Treatment Layer:** Reconstruction only option [rehab-asphalt-reconstruction]
5. **Cost Layer:** $85/yd² from [bid-data-overview]
6. **Priority:** Urgent (PCI < 40 = "Very Poor") [gdot-timing-optimization]

**Transparency Test:** Can it explain the full evidence chain?

---

### Query 24
```
Rank our inspection findings by urgency and recommend treatment sequence.
```
**Expected Answer Should Reference:**
- Defects → PCI bands → Treatment urgency
- Year 1: Block/alligator cracks, PCI < 50 → Reconstruction
- Year 2: Fair segments, PCI 50–70 → Mill + overlay
- Year 3+: Preventive, PCI > 70 → Seal coat
- Budget: Allocate $3.506M/year per IMS plan
- Should cite: [inspection-data], [gdot-pci-thresholds], [ims-2023-rehab-program]

**Portfolio Optimization Test:** Can it prioritize across the network?

---

### Query 25
```
Why might the GDOT guide and the 2024 contractor bids give different cost estimates?
```
**Expected Answer Should Explain:**
- GDOT base rates: Engineering standards ($2.25–$85/yd²)
- 2024 bids: Real market prices, 7 contractors, local conditions
- Reasons for differences:
  - Contractor overhead & profit margin
  - Local labor availability
  - Equipment costs
  - Timeline urgency premiums
  - Quality/warranty differences
- Best practice: Use GDOT for planning, 2024 bids for budgeting
- Should cite: [gdot-preservation-philosophy], [bid-data-overview]

**Reconciliation Test:** Can it explain source differences maturely?

---

## 🎯 **Evaluation Scoring Guide**

For each query, score on:

| Criterion | Excellent (3) | Good (2) | Fair (1) | Poor (0) |
|-----------|---|---|---|---|
| **Data Accuracy** | Exact numbers from data | Off by <5% | Off by 5–20% | Hallucinated |
| **Source Citations** | All sources cited with [id] | Most sources | Few sources | No citations |
| **Completeness** | All relevant data included | 80%+ coverage | 50%+ coverage | Incomplete |
| **Grounding Chain** | Full logic from data→recommendation | Mostly logical | Some gaps | Unsupported |
| **Transparency** | Clear why this data matters | Mostly clear | Vague | Opaque |

---

## 🚀 **How to Test**

1. **Copy each query into the chatbot** (http://localhost:5173)
2. **Record the answer and sources cited**
3. **Check against "Expected Data Points"**
4. **Score using the rubric above**
5. **Note any hallucinations or missing context**

---

## 📊 **What Good Answers Look Like**

### ✅ Query 9 - GOOD Answer
```
For PCI 75, the treatment is Slurry Seal/Seal Coat at $2.25/yd².

This is in the 70–80 (Fair condition) band according to the 
Rehab Activities table from the 2023 ESA workbook. The GDOT 
Preservation Guide recommends preventive treatments at this 
level to slow oxidation and extend pavement life.

Evidence:
- [rehab-asphalt-slurry-seal] Treatment & cost mapping
- [gdot-pci-thresholds] PCI 70–80 = Fair, preventive recommended
- [ims-2023-rehab-program] Similar strategy in 5-year plan
```

### ❌ Query 9 - BAD Answer
```
The treatment for PCI 75 is a 3-inch asphalt overlay at $12/yd².
```
**Why bad:** Wrong treatment, wrong cost, no sources, hallucinated numbers.

---

**These 25 queries will thoroughly evaluate your RAG system's ability to ground answers in real data!** 🎯
