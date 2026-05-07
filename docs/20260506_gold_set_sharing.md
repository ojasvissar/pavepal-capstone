# Phase 1 Gold Set — Q01 Example (for sharing)

**Date:** 2026-05-06
**Purpose:** One worked example of a Phase 1 gold-set question, for review and discussion. The full gold set will be 10 questions; full distribution and field rationale are documented in [Project_plan/20260506_gold_set.md](Project_plan/20260506_gold_set.md).

---

## Q01 — cross-source synthesis

A "cross-source" question requires combining information from the road-data JSONs (specific defects detected on the road) with the GDOT pavement preservation guide (treatment selection guidelines + effectiveness research). Neither source alone is sufficient.

> **Note on GDOT's selection framework.** GDOT keys **treatment selection** off distress type + severity level + traffic ADT (see **Table 66, p. 390**), not directly off PCI. PCI is used separately for **timing decisions** (Figure 1, p. 9 — preserve early in life when condition is still high) and for **effectiveness research** (Conclusions, p. 3 — crack sealing is 52–72% effective on pavements in the COPACES 79–85 range). The reference answer below reflects that two-pronged framework. The PACES manual (GDOT Appendix B) defines severity levels.

| Field | Value |
|---|---|
| `qid` | `Q01` |
| `category` | `cross_source` |
| `question` | "What treatment does GDOT recommend for Peachtree Industrial Blvd Access Rd?" |
| `paraphrase_1` | "Per the GDOT guide, what's the appropriate maintenance for Peachtree Industrial Blvd Access Rd?" |
| `paraphrase_2` | "What pavement preservation activity should we apply to Peachtree Industrial Blvd Access Rd?" |
| `gold_chunks` | `["roadSeg_<peachtree_id>", "GDOT_p390", "GDOT_p003"]` *(placeholder IDs — real IDs come from the indexed corpus. Page 390 = Table 66 selection guidelines; page 3 = COPACES effectiveness research.)* |
| `expected_sources` | `["roadSegments", "GDOT"]` |
| `canonical_claims` | `["transverse", "longitudinal", "crack seal", "severity"]` |
| `reference_answer` | "Peachtree Industrial Blvd Access Rd has a PCI of 82 with 5 transverse cracks and 12 longitudinal cracks per the road-segment data. GDOT's AC Pavement Treatment Selection Guidelines (Table 66, p. 390) key treatment selection off distress type, severity, and traffic — not directly off PCI. The transverse cracks fall under GDOT's Block/Transverse Cracking category; the longitudinal cracks map to either Load Cracking (if in wheelpaths) or Reflection Cracking. GDOT's effectiveness analysis (p. 3) shows crack sealing is 52–72% effective on pavements in the COPACES 79–85 range — which includes PCI 82 — and GDOT's updated criteria allow crack sealing up to a maximum COPACES of 85–90. Crack sealing is therefore the recommended treatment here for low-severity (Level 1) cracks; higher severities reduce effectiveness and may warrant chip seal or thin overlay. The road-segment data does not include severity levels, so a PACES-manual assessment (GDOT Appendix B) would be needed to finalize." |

### Field meanings

| Field | What it is |
|---|---|
| `qid` | Stable ID for tracking this question across eval runs |
| `category` | Question type — one of `cross_source`, `gdot_only`, `road_data`, `refusal` |
| `question` | The query the user types in |
| `paraphrase_1` / `paraphrase_2` | The same question reworded — checks whether the system answers consistently when wording changes |
| `gold_chunks` | IDs of the data chunks that contain the right answer; the system's retrieval is judged on whether it surfaces these |
| `expected_sources` | Which sources should be hit (`GDOT`, `roadSegments`, or `locations`) — drives the per-source recall metric |
| `canonical_claims` | Key facts/phrases the system's answer should mention |
| `reference_answer` | Full gold-standard answer in prose; used by an LLM-judge to score correctness |
