# Phase 1 Working Log

**Date opened:** 2026-05-06
**Purpose:** Concrete next steps coming out of the [research log](20260506_phase_1_research_log.md). Each task records *why* it exists, what *done* looks like, and findings as we work.

---

## Task format

````
## T<N> — <short title>

- **Status:** Open | In progress | Done | Blocked
- **Owner:** <name or TBD>
- **Why:** <plain-English reason a non-technical reader can follow; link to research-log section if relevant>
- **What exactly to do:** <concrete steps / output that closes the task>
- **Findings:** <filled in as work progresses>
````

---

## Questions/Acknowledgment for PavePal Partners: 
1. PDF text processing is our focus, image process will be tricky. Would citing images be a priority? Any scenarios where the image plays a more important role than text in the answer? 

2. In the Json file, when defect:{} vs pci is missing, which one is just pci not scanned and which one is actually about "No defects being detected?"

3. On Page 407, or pdf 390, is Table 66 a critical table for treatment decision making? If so, Distress Type, Severity Level, Traffic ADT are more important info compared to PCI ? based on the table ? 

Ans: Table 66 IS the operational treatment-selection guideline.
Distress type, severity level, and traffic ADT ARE the primary inputs. PCI is used separately for timing (when to preserve) and effectiveness research (how well treatments work at different conditions), not as the direct selection input.

4. Is it even worth while to embed the json files?

Ans:
The JSON is missing severity levels — which is what GDOT's Table 66 actually keys off. So the JSON alone can never give a complete, GDOT-grounded answer.

PCI is still useful for prioritization but isn't a treatment input

Without severity, the system always has to hedge ("if Severity Level 1, then X; if Level 2, then Y")

5. Where is this PACES mannual ? 

6. Severity is not in the JSON files? that is a missing piece of information when providing reference answers or treatment recommendations. 

7. 


---

## T1 — Contrast pypdf + pdfplumber on GDOT

- **Status:** Open
- **Owner:** Ojasv (TBD — confirm)
- **Why:** PDFs can be text-heavy or table-heavy, and the right parsing tool changes accordingly. We need to actually look at GDOT before locking in pypdf. (Research-log context: [§3.1](20260506_phase_1_research_log.md))
- **What exactly to do:** Compare parsed output from pypdf vs pdfplumber on 5 pages of GDOT, with at least 1 table-heavy page for testing.
- **Findings:** _(to fill)_

---

## T1.1 - Contrast 4 types of more complex pages and assess parsing result

- **Pages to use to assess:**
GDOT Table 66 on page 390 in text, or page 407 out of 472. 

Figure 203, the entire page 386 in text or page 403 out of 472

Figure 202, photo, Asphalt Pavement Treatment Methods, page 384 in text, page 401 out of 472

Figure 199, Graoh Effectiveness of Fog Seal xyz, text page 366, or 384 out of 472 

- **What is expected:** 
Table 66 should use pdfplumber.extract_table() -> markdown
Figure 199, Figure 202, Figure 203 will all use Vision LLM 

The Vision LLM workflow:


Page 384 (PDF)
  ↓ render to image (pdf2image or PyMuPDF .get_pixmap())
PNG of page 384
  ↓ send to Gemini 2.5 Pro with prompt:
    "Describe this figure for a search index. If it is a graph,
     state the title, axes, and the key trend or takeaway in 2-3
     sentences. Output plain text."
  ↓ Gemini response
"Figure 199, page 366: graph titled 'Effectiveness of Fog Seal.'
 X-axis = years post-treatment, Y-axis = PCI. The treated curve
 stays above the untreated curve for ~5 years before converging."
  ↓ store as a chunk with metadata {page: 384, source_type: "vision_caption"}
That generated description is then just another chunk — embedded by BGE, tokenized into BM25, retrieved by RRF like everything else. The pipeline downstream doesn't know it came from a graph.




## T2 — Verify the BGE query prefix is actually applied

- **Status:** Open
- **Owner:** William (TBD — confirm)
- **Why:** The dense embedding model (BGE) expects user questions to be prepended with a fixed phrase (`"Represent this sentence for searching relevant passages: "`) before being embedded. If that prefix is missing, retrieval quality drops without throwing any error — silent failure. We need to confirm the prefix is being applied at query time and check whether it actually changes results. (Research-log context: [§3.5](20260506_phase_1_research_log.md))
- **What exactly to do:** Log the embedded query string during one sample run to confirm the prefix is there. Then pick 5 test questions, run each twice (with prefix and without), and compare the top-5 retrieval results side by side.
- **Findings:** _(to fill)_

---

## T3 — Sanity-check source-aware retrieval (policy B)

- **Status:** Open
- **Owner:** TBD
- **Why:** Our corpus is 89% road inspection points, 8% road segments, and 2% GDOT guide content. If we query the whole index together, GDOT answers get drowned out by sheer volume. We picked policy B (pull top-K from each source separately, then fuse with RRF) to prevent that — but we need to confirm it actually returns balanced chunks across sources before locking it in. (Research-log context: [§5.5](20260506_phase_1_research_log.md))
- **What exactly to do:** Run 3 test queries through the policy-B retriever, one biased toward each source:
  - GDOT-leaning: *"What's the cheapest treatment for PCI 65?"*
  - Road-name-leaning: *"Tell me about Engineering Dr"*
  - Defect-leaning: *"Which roads have transverse cracks?"*

  For each, confirm the top-5 chunks include at least one from the expected source.
- **Findings:** _(to fill)_
