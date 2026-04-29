# Retrieval Evaluation Report

## Summary

- Generated at: `2026-04-29T21:02:45.864211+00:00`
- Documents indexed: `23456`
- Queries evaluated: `8`
- top_k: `6`
- alpha: `0.65`
- Mean Precision@k: `0.7083`
- Mean Recall@k: `0.0515`
- Mean MRR: `0.7188`
- Mean nDCG@k: `0.7004`

## Failure Modes

- `low_retrieval_confidence_gap`: 4
- `missing_structured_evidence`: 6
- `no_relevant_retrieval`: 1

## Per Query Results

### Q1: Which roads look highest priority for maintenance and why?
- Precision@k: `0.0`
- Recall@k: `0.0`
- MRR: `0.0`
- nDCG@k: `0.0`
- Failure modes: `no_relevant_retrieval, missing_structured_evidence`
- Top retrieved:
  - [1] GDOT PAVEMENT PRESERVATION GUIDE (1) (1).pdf/manual-456-0 | score=1.0 | relevant=False
  - [2] GDOT PAVEMENT PRESERVATION GUIDE (1) (1).pdf/manual-193-1 | score=0.9061 | relevant=False
  - [3] GDOT PAVEMENT PRESERVATION GUIDE (1) (1).pdf/manual-78-0 | score=0.8592 | relevant=False

### Q2: Summarize defect patterns on PEACHTREE PKWY.
- Precision@k: `1.0`
- Recall@k: `0.0096`
- MRR: `1.0`
- nDCG@k: `1.0`
- Failure modes: `missing_structured_evidence, low_retrieval_confidence_gap`
- Top retrieved:
  - [1] locations/location-20627 | score=1.0 | relevant=True
  - [2] locations/location-22 | score=0.9927 | relevant=True
  - [3] locations/location-69 | score=0.9884 | relevant=True

### Q3: What defect patterns are visible on ELMSIDE VILLAGE LN?
- Precision@k: `1.0`
- Recall@k: `0.0822`
- MRR: `1.0`
- nDCG@k: `1.0`
- Failure modes: `low_retrieval_confidence_gap`
- Top retrieved:
  - [1] locations/location-15214 | score=1.0 | relevant=True
  - [2] roadSegments/road-1335 | score=0.9962 | relevant=True
  - [3] locations/location-3236 | score=0.9898 | relevant=True

### Q4: For roads with low PCI, what treatment guidance is suggested in the manual?
- Precision@k: `0.6667`
- Recall@k: `0.0235`
- MRR: `0.5`
- nDCG@k: `0.5896`
- Failure modes: `missing_structured_evidence`
- Top retrieved:
  - [1] GDOT PAVEMENT PRESERVATION GUIDE (1) (1).pdf/manual-138-1 | score=1.0 | relevant=False
  - [2] GDOT PAVEMENT PRESERVATION GUIDE (1) (1).pdf/manual-14-4 | score=0.9375 | relevant=True
  - [3] GDOT PAVEMENT PRESERVATION GUIDE (1) (1).pdf/manual-400-0 | score=0.9293 | relevant=True

### Q5: Compare defect patterns between ENGINEERING DR and GOLDEN LEAF TRL.
- Precision@k: `1.0`
- Recall@k: `0.0385`
- MRR: `1.0`
- nDCG@k: `1.0`
- Failure modes: `missing_structured_evidence, low_retrieval_confidence_gap`
- Top retrieved:
  - [1] locations/location-16861 | score=1.0 | relevant=True
  - [2] locations/location-16849 | score=1.0 | relevant=True
  - [3] locations/location-16840 | score=1.0 | relevant=True

### Q6: Which defects should trigger preventive maintenance instead of reconstruction?
- Precision@k: `0.8333`
- Recall@k: `0.061`
- MRR: `1.0`
- nDCG@k: `0.8829`
- Failure modes: `none`
- Top retrieved:
  - [1] GDOT PAVEMENT PRESERVATION GUIDE (1) (1).pdf/manual-30-0 | score=1.0 | relevant=True
  - [2] GDOT PAVEMENT PRESERVATION GUIDE (1) (1).pdf/manual-138-0 | score=0.865 | relevant=True
  - [3] GDOT PAVEMENT PRESERVATION GUIDE (1) (1).pdf/manual-52-0 | score=0.7408 | relevant=True

### Q7: What evidence suggests urgent intervention on GREEN POINTE PKWY?
- Precision@k: `1.0`
- Recall@k: `0.0541`
- MRR: `1.0`
- nDCG@k: `1.0`
- Failure modes: `missing_structured_evidence, low_retrieval_confidence_gap`
- Top retrieved:
  - [1] locations/location-3666 | score=1.0 | relevant=True
  - [2] locations/location-3631 | score=1.0 | relevant=True
  - [3] locations/location-3671 | score=0.9987 | relevant=True

### Q8: How can we justify maintenance decisions with traceable sources?
- Precision@k: `0.1667`
- Recall@k: `0.1429`
- MRR: `0.25`
- nDCG@k: `0.1303`
- Failure modes: `missing_structured_evidence`
- Top retrieved:
  - [1] GDOT PAVEMENT PRESERVATION GUIDE (1) (1).pdf/manual-222-1 | score=1.0 | relevant=False
  - [2] GDOT PAVEMENT PRESERVATION GUIDE (1) (1).pdf/manual-456-0 | score=0.4315 | relevant=False
  - [3] GDOT PAVEMENT PRESERVATION GUIDE (1) (1).pdf/manual-464-1 | score=0.3403 | relevant=False
