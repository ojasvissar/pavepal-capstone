# 📋 Quick Reference: 25 Data-Based Evaluation Queries

Use this quick guide to evaluate your RAG system comprehensively.

---

## **A. Inspection Data (5 queries)** 
Test: locations.json & roadSegments.json retrieval

| # | Query | Expected Key Data | Test |
|---|-------|-------------------|------|
| 1 | How many locations? Most common defect? | 20,829 locations; Longitudinal cracks (29,277) | Accuracy of counts |
| 2 | Scanned vs scheduled segments? | 1,467 scanned (75%); 493 scheduled (25%) | Percentage math |
| 3 | List all defects least to most | Sealing(1)...Longitudinal(29,277) | Complete taxonomy |
| 4 | When were images captured? | May 14–21, 2025; July 17–19, 2025 | Date extraction |
| 5 | How many have zero defects? | 3,406 of 20,829 (16%) | Null value handling |

---

## **B. Road Infrastructure (3 queries)**
Test: roadSegments.json properties & relationships

| # | Query | Expected Key Data | Test |
|---|-------|-------------------|------|
| 6 | Main road classes & most common? | Residential(1,305), Major Arterial(499) | Categorical summary |
| 7 | What info per segment? | PCI, speed limit, coordinates, ownership, GIS data | Full data model |
| 8 | Which segments scheduled but not scanned? | 493 segments (status="scheduled", no PCI) | Status filtering |

---

## **C. PCI & Treatment (4 queries)**
Test: Rehab Activities table accuracy & decision logic

| # | Query | Expected Answer | Test |
|---|-------|-----------------|------|
| 9 | PCI 75 → treatment & cost? | Slurry Seal @ $2.25/yd² | **CRITICAL** - core decision query |
| 10 | PCI 55 → cheapest repair? | Mill+Overlay @ $18.25/yd² | Doesn't hallucinate cheaper option |
| 11 | PCI 65 → all options ranked by cost? | MicroSurface($3.10) vs ThinOverlay($40.29) | Multi-option comparison |
| 12 | PCI threshold for reconstruction? | PCI < 40; Cost $85/yd²+ | Identifies critical boundary |

---

## **D. GDOT Guidance (4 queries)**
Test: Pavement Preservation Guide authority & specifics

| # | Query | Expected Topic | Test |
|---|-------|-----------------|------|
| 13 | GDOT preservation philosophy? | Early treatment 3–5x cheaper than reconstruction | Understands cost benefit |
| 14 | GDOT on block/alligator cracks? | Network = structural; reconstruction only | Flags severity correctly |
| 15 | GDOT chip seal specs? | Grad spec 341-5, tack coat, 50–90°F, 24hr cure | Technical detail retrieval |
| 16 | Optimal timing for treatment? | Apply PCI 70→65 or 60→55 window | Identifies sweet spot |

---

## **E. Cost & Bidding (3 queries)**
Test: 2024 Contractor Bid Tabulation accuracy & variation

| # | Query | Expected Data | Test |
|---|-------|----------------|------|
| 16 | Milling cost range 2024? | $2.38–$8.10/yd² (240% spread!) | Shows market variation |
| 17 | Manhole adjustment cost? | $185–$1,850 (900% spread!!!) | Flags high uncertainty items |
| 18 | Budget for 10k yd² overlay? | $450k–$780k ($330k range) | Does math with prices |

---

## **F. IMS Reports (4 queries)**
Test: 2023 & 2015 pavement management data integration

| # | Query | Expected Data | Test |
|---|-------|----------------|------|
| 19 | 5-year budget? | $3.506M/year; 304.1 km network | Cites planning documents |
| 20 | Budget allocation by treatment? | Seal 20–25%; Mill/Overlay 50–60%; Reconstruction 10–15% | Strategy explanation |
| 21 | 2015 vs 2023 comparison? | 2015: 1,034 segments; 2023: ~7,500 segments (7x!) | Trend analysis |
| 22 | 2023 methodology? | Automated imaging + field verification + ASTM D6433 | Standards recognition |

---

## **G. Multi-Source Integration (3 queries)**
Test: Full grounding chain across all sources

| # | Query | Expected Integration | Test |
|---|-------|----------------------|------|
| 23 | Decision chain for 15 block-crack segments? | Data→Defect→GDOT→Treatment→Cost→Priority | **Transparency Chain** |
| 24 | Rank network by urgency? | PCI<50→Reconstruction; 50–70→Overlay; >70→Seal | **Portfolio Optimization** |
| 25 | GDOT vs Bid pricing differences? | Market variation, overhead, local conditions | **Mature Reconciliation** |

---

## 🎯 **Test Strategy**

### **Quick Test (10 min)**
Run queries: **1, 9, 14, 17, 23**
- Tests: Data accuracy, core decision, guidance, costs, integration

### **Standard Eval (30 min)**
Run queries: **1–7, 9, 10, 14, 17, 19, 23**
- Tests: Most critical paths

### **Full Eval (60+ min)**
Run all 25 queries
- Complete coverage

---

## 📊 **Scoring Template**

```
Query #1: "How many locations? Most common defect?"
✅ Answer: 20,829 locations; longitudinal cracks (29,277)
✅ Sources: [inspection-data], [data-summary]
✅ Accuracy: EXACT
✅ Transparency: Shows data chain

Query #2: "Scanned vs scheduled?"
⚠️ Answer: "Many segments scanned, some scheduled"
❌ Sources: Only [inspection-data]
⚠️ Accuracy: MISSING percentages
❌ Transparency: No specific numbers

Score: Q1 (3/3) | Q2 (1/3)
```

---

## 🚩 **Red Flags (Failure Modes)**

| Issue | Example | What it means |
|-------|---------|---------------|
| **Hallucination** | "PCI 70 needs $50/yd² overlay" | Made up data not in sources |
| **Missing Data** | "Treatment available for PCI 70" (no cost) | Incomplete retrieval |
| **Wrong Source** | Cites [bid-data] instead of [rehab-activities] | Confused retrieval ranking |
| **No Citations** | Answer with no [source-id] references | Not grounded |
| **Wrong Numbers** | "1,500 locations" instead of 20,829 | Math error or data loss |
| **Vague Guidance** | "GDOT says maintain roads" | Lost specific engineering detail |

---

## 🎓 **Expected Results for Your Capstone**

| Metric | Target | Your Result |
|--------|--------|------------|
| **Accuracy** | 90%+ of numbers exact | _____ |
| **Citation Rate** | All claims have [source-id] | _____ |
| **Completeness** | 80%+ of relevant data included | _____ |
| **Grounding Quality** | Full chain visible (data→rec) | _____ |
| **Failure Modes Caught** | Identifies 80%+ of hallucinations | _____ |

---

## 💾 **Save Your Results**

Create a results file: `RAG_EVALUATION_RESULTS.txt`

```
Evaluation Date: April 29, 2026
Model: Gemini 2.0 Flash
Test Set: 25 Data-Based Queries

RESULTS:
=======

Query 1 (Inspection Data):
- Accuracy: ✅ EXACT
- Citations: ✅ YES
- Score: 3/3

Query 2 (Scanned vs Scheduled):
- Accuracy: ❌ MISSING %
- Citations: ⚠️ PARTIAL
- Score: 1/3

[Continue for all 25...]

SUMMARY:
========
Average Accuracy: 86%
Average Citation Rate: 92%
Hallucinations Detected: 2 (queries #11, #18)
Missing Context: 3 (queries #7, #14, #20)

KEY FINDINGS:
=============
✅ Strong on: PCI lookups, cost retrieval, GDOT citations
⚠️ Weak on: Multi-option comparisons, failure mode explanations
❌ Issues: Sometimes mixes PCI ranges, bid pricing variation

RECOMMENDATIONS:
================
1. Boost rehab activities retrieval (scoring +2)
2. Add explicit failure mode detection
3. Test with edge cases (PCI boundaries)
```

---

## 🚀 **Next Steps**

1. **Add your Gemini API key** to `.env`
2. **Run `npm run dev`**
3. **Copy-paste each query** into chatbot
4. **Record answers** in results file
5. **Calculate average scores**
6. **Document findings** for capstone report

---

**Document:** `DATA_BASED_EVALUATION_QUERIES.md` has detailed version of all 25 queries.

Good luck with your evaluation! 🎯
