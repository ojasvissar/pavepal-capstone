/**
 * Document Extraction Utilities
 * Extracts and processes documents for RAG knowledge base
 * This module provides utilities for extracting content from PDFs and Excel files
 */

import fs from 'fs';
import path from 'path';

/**
 * Manual extraction of key rehabilitation activities data
 * This is the critical table from the 2023 ESA workbook
 * Maps PCI bands to recommended rehab activities and costs
 */
export function getRehabActivities() {
  return [
    {
      id: 'rehab-all-routine',
      pavetype: 'All',
      activity: 'Routine Maintenance',
      minPCI: 80,
      maxPCI: 100,
      baseRate: 0,
      description: 'Regular inspection and spot repairs',
    },
    {
      id: 'rehab-asphalt-slurry-seal',
      pavetype: 'Asphalt',
      activity: 'Slurry Seal / Seal Coat',
      minPCI: 70,
      maxPCI: 80,
      baseRate: 2.25,
      unitCost: '$/yd²',
      description: 'Protective surface treatment to slow oxidation and moisture intrusion',
    },
    {
      id: 'rehab-asphalt-microsurface',
      pavetype: 'Asphalt',
      activity: 'MicroSurface / Chip Seal',
      minPCI: 60,
      maxPCI: 70,
      baseRate: 3.1,
      unitCost: '$/yd²',
      description: 'Fine-graded asphalt emulsion with aggregate for light-duty surfaces',
    },
    {
      id: 'rehab-asphalt-thin-overlay',
      pavetype: 'Asphalt',
      activity: 'Edge Mill + Thin Overlay',
      minPCI: 60,
      maxPCI: 70,
      baseRate: 40.29,
      unitCost: '$/yd²',
      description: 'Mill edges and apply thin asphalt overlay to extend life',
    },
    {
      id: 'rehab-asphalt-moderate-overlay',
      pavetype: 'Asphalt',
      activity: 'EM/FWM + Moderate Overlay',
      minPCI: 50,
      maxPCI: 60,
      baseRate: 18.25,
      unitCost: '$/yd²',
      description: 'Full-width mill and moderate thickness overlay for moderate distress',
    },
    {
      id: 'rehab-asphalt-thick-overlay',
      pavetype: 'Asphalt',
      activity: 'FWM + Thick Overlay (>2.5")',
      minPCI: 40,
      maxPCI: 50,
      baseRate: 22.25,
      unitCost: '$/yd²',
      description: 'Full-width mill with thick overlay for significant structural needs',
    },
    {
      id: 'rehab-asphalt-reconstruction',
      pavetype: 'Asphalt',
      activity: 'Full Reconstruction',
      minPCI: 0,
      maxPCI: 40,
      baseRate: 85.0,
      unitCost: '$/yd²',
      description: 'Complete removal and reconstruction of pavement structure',
    },
    {
      id: 'rehab-concrete-seal',
      pavetype: 'Concrete',
      activity: 'Concrete Sealer',
      minPCI: 70,
      maxPCI: 100,
      baseRate: 1.5,
      unitCost: '$/yd²',
      description: 'Protective sealing to prevent water and chemical penetration',
    },
    {
      id: 'rehab-concrete-joint-sealing',
      pavetype: 'Concrete',
      activity: 'Joint Sealing and Repair',
      minPCI: 50,
      maxPCI: 70,
      baseRate: 5.0,
      unitCost: '$/yd²',
      description: 'Seal and repair concrete joints to prevent water infiltration',
    },
    {
      id: 'rehab-concrete-overlay',
      pavetype: 'Concrete',
      activity: 'Bonded Concrete Overlay',
      minPCI: 30,
      maxPCI: 50,
      baseRate: 45.0,
      unitCost: '$/yd²',
      description: 'Place bonded concrete overlay over existing pavement',
    },
  ];
}

/**
 * GDOT Pavement Preservation Guide - Key sections extracted
 * Based on 472-page GDOT guide (Research Project 14-06)
 */
export function getGDOTGuideSections() {
  return [
    {
      id: 'gdot-preservation-philosophy',
      title: 'GDOT Preservation Philosophy',
      section: 'Chapter 1',
      content: `The GDOT Pavement Preservation Guide emphasizes timely intervention at the right PCI level:
      
- Preservation treatments are most cost-effective when applied before pavement condition deteriorates
- Typical preservation activities (seal coat, chip seal, thin overlay) cost $2-$45/yd²
- Major reconstruction (>$80/yd²) is required only when pavement is severely distressed (PCI < 40)
- The economic benefit of early treatment can be 3-5x compared to delayed reconstruction
- Proper asset management requires coordination with traffic management and budget planning`,
    },
    {
      id: 'gdot-pci-thresholds',
      title: 'PCI-Based Treatment Selection',
      section: 'Chapter 2',
      content: `Pavement Condition Index (PCI) guides treatment selection:

PCI 90-100 (Excellent): No treatment needed beyond routine maintenance
PCI 80-90 (Good): Consider preventive maintenance (seal coat, fog seal)
PCI 70-80 (Fair): Light preservation treatments (slurry seal, chip seal)
PCI 60-70 (Satisfactory): Moderate preservation (microsurface, thin overlay)
PCI 50-60 (Marginal): Intermediate rehab needed (mill and moderate overlay)
PCI 40-50 (Poor): Major rehab required (full-width mill, thick overlay)
PCI < 40 (Very Poor): Reconstruction or complete pavement removal recommended

Delaying treatment between PCI bands significantly increases future costs.`,
    },
    {
      id: 'gdot-defect-severity',
      title: 'Defect Severity and Treatment Implications',
      section: 'Chapter 3',
      content: `Different defect types have different severity implications:

CRACKING:
- Longitudinal cracks: Run parallel to traffic, often indicate raveling at edges
- Transverse cracks: Run perpendicular, indicate thermal movement or fatigue
- Block/Alligator cracks: Network pattern indicates structural failure, require major rehab
- Treatment: Early sealing for hairline cracks; major rehab for block pattern

SURFACE DAMAGE:
- Potholes: Indicate base failure, require patching and potential overlay
- Raveling: Loss of binder and aggregate, treat with seal coat
- Bleeding: Excess asphalt rising, treat with aggregate application

STRUCTURAL INDICATORS:
- Rutting: Permanent deformation, indicates subgrade or base failure
- Shoving: Horizontal displacement, requires full reconstruction
- Depression: Pavement below design elevation, indicates settlement`,
    },
    {
      id: 'gdot-construction-specs',
      title: 'Construction Specifications and QA/QC',
      section: 'Chapter 4-5',
      content: `GDOT preservation treatments require specific construction procedures:

SEAL COAT / SLURRY SEAL:
- Temperature requirements: Apply only in dry conditions, 50-90°F
- Cure time: Minimum 24 hours before traffic
- Quality check: Inspect for proper texture, no fat spots, even color

CHIP SEAL / MICROSURFACE:
- Aggregate gradation: Must meet GDOT specification 341-5
- Tack coat: Ensure proper emulsion rate
- Compaction: Light traffic for 7 days minimum

OVERLAY:
- Milling: Remove up to 2 inches for mill + overlay work
- Bonding: Ensure tack coat coverage on millface
- Compaction: Achieve 92% density minimum
- Thickness verification: Core tests at specified intervals`,
    },
    {
      id: 'gdot-timing-optimization',
      title: 'Optimal Timing of Pavement Preservation',
      section: 'Enhanced Guidelines',
      content: `Timing is critical for preservation effectiveness:

OPTIMAL TREATMENT WINDOWS:
- Apply preservation in the "sweet spot" before accelerated deterioration
- Most effective window: PCI transitions from 70→65, or 60→55
- Early treatment (PCI 75+): May not be cost-effective if pavement still declining slowly
- Late treatment (PCI < 50): Preservation treatments will fail; major rehab required

FAILURE CONSEQUENCES:
- Missing the treatment window can mean additional $30-60/yd² in future costs
- Structural failures (rutting, shoving) indicate base failure: reconstruction only cure
- Environmental factors (freeze-thaw, high groundwater): May accelerate deterioration

NETWORK-LEVEL COORDINATION:
- Prioritize treatment of segments with highest traffic volumes
- Consider remaining service life of adjacent segments
- Coordinate with other infrastructure work (utilities, drainage)`,
    },
  ];
}

/**
 * 2024 Contractor Bid Data - Key pricing information
 * From: PTC 24-05 2024 Street Resurfacing Full Bid Tabulation
 */
export function get2024BidTabulation() {
  return [
    {
      id: 'bid-data-overview',
      title: '2024 Contractor Bid Pricing (Peachtree Corners)',
      source: 'PTC 24-05 2024 Street Resurfacing Full Bid Tabulation',
      content: `Seven contractors bid on 2024 resurfacing work. Price variation shows market competition:

SAMPLE UNIT PRICES:
- Adjust Manholes to Grade: $185–$1,850 per each (variation: 900%)
- Remove and Replace Catch Basin: $625–$1,950 per each
- Recycled Asphalt Patching: $135–$218 per ton
- Milling Asphalt Pavement: $2.38–$8.10 per square yard
- Dense Grade Asphalt Overlay (2"): $45–$78 per square yard
- Tack Coat Application: $0.15–$0.45 per square yard

COST IMPLICATIONS:
- Low-cost contractor pricing: Enables maximum network coverage within budget
- High-cost contractor pricing: Reflects either superior quality, equipment costs, or market conditions
- Volume discounts: Larger projects typically achieve lower unit rates
- Timeline impact: Some contractors charge premiums for expedited work`,
    },
    {
      id: 'bid-data-asphalt-overlay',
      title: 'Dense Grade Asphalt Overlay Pricing',
      range: '$45–$78/yd²',
      thickness: '2 inches',
      note: 'Most common treatment in Peachtree Corners 2024 program',
    },
    {
      id: 'bid-data-milling',
      title: 'Asphalt Milling',
      range: '$2.38–$8.10/yd²',
      depth: 'Variable depth',
      note: 'Significant cost range reflects equipment and labor availability',
    },
  ];
}

/**
 * 2023 IMS Pavement Management Report Summary
 * From: Peachtree Corners Report 2023.pdf
 */
export function getIMS2023ReportData() {
  return [
    {
      id: 'ims-2023-executive-summary',
      title: 'IMS 2023 Executive Summary',
      source: 'Peachtree Corners Report 2023.pdf',
      content: `NETWORK OVERVIEW:
- Total centerline miles: 304.1 km of public roads
- Total segments analyzed: ~7,500 road segments
- Pavement types: Primarily asphalt with some concrete

PAVEMENT CONDITION (May 2023 Survey):
- Average Network PCI: Fair condition (data varies by neighborhood)
- 5-year rehab budget: $3.506M annually
- Critical segments requiring immediate action: Identified in rehab plan

DEFECT SUMMARY (from CV inspection + field verification):
- Most common: Longitudinal and transverse cracking
- Severity: Block/alligator cracks indicate structural distress in ~15% of network
- Manhole covers: 1,286 detected across 20,829 inspection points`,
    },
    {
      id: 'ims-2023-methodology',
      title: 'IMS 2023 Data Collection Methodology',
      content: `SURVEY METHODS:
- Automated pavement condition collection via surface imaging
- Visual field verification of condition ratings
- Defect inventory by location and type
- PCI calculation per ASTM D6433

CONDITION RATING SCALE:
- Excellent (90-100 PCI): No repair needed
- Good (80-90 PCI): Monitor, consider preventive maintenance
- Fair (70-80 PCI): Preventive maintenance recommended
- Satisfactory (60-70 PCI): Treatment needed within 2 years
- Marginal (50-60 PCI): Treatment needed within 1 year
- Poor (40-50 PCI): Major rehabilitation needed
- Very Poor (0-40 PCI): Reconstruction or reconstruction recommended`,
    },
    {
      id: 'ims-2023-rehab-program',
      title: 'IMS 2023 Recommended 5-Year Rehab Program',
      content: `BUDGET ALLOCATION:
- Annual average: $3.506M
- Total 5-year program: ~$17.53M
- Projects prioritized by: PCI, traffic volume, condition severity

TREATMENT DISTRIBUTION (estimated):
- Seal coat / preventive: 20-25% of segments
- Mill and overlay: 50-60% of segments
- Full reconstruction: 10-15% of segments
- Deferred to future years: Remaining

IMPLEMENTATION STRATEGY:
- Year 1: Critical segments (PCI < 50)
- Years 2-3: Fair-condition segments (PCI 50-70)
- Years 4-5: Preventive maintenance on good segments (PCI 70-80)`,
    },
  ];
}

/**
 * 2015 Baseline Data Summary
 * For trend analysis and historical context
 */
export function getIMS2015BaselineData() {
  return [
    {
      id: 'ims-2015-survey',
      title: 'IMS 2015 Baseline Survey',
      source: 'Peachtree Corners GA 2015 Report_Rev2.pdf',
      surveyDate: '2015-07-01',
      content: `2015 BASELINE (Historical Reference):
- Network segments surveyed: ~1,034 segments
- Survey methodology: Initial pavement assessment
- Baseline PCI established: Used for trend tracking

CONDITION IN 2015:
- Average network PCI: [Baseline for comparison]
- Rehabilitation needs: Estimated at $1.5M annually for selected program

PURPOSE:
- Establishes baseline for 2015→2022 trend analysis
- Allows calculation of network deterioration rate
- Informs predictive models for future PCI decline
- Validates effectiveness of past treatment investments`,
    },
  ];
}

/**
 * Combine all extracted documents into a unified knowledge base
 */
export function buildComprehensiveKnowledgeBase() {
  const allDocuments = [
    ...getRehabActivities().map((item) => ({
      id: item.id,
      title: `${item.activity} (${item.pavetype})`,
      category: 'rehabilitation',
      summary: `PCI ${item.minPCI}-${item.maxPCI}: ${item.activity} at $${item.baseRate}${item.unitCost || '/yd²'}`,
      content: item.description,
      tags: [
        'rehabilitation',
        'treatment',
        'cost',
        item.pavetype,
        `PCI-${item.minPCI}-${item.maxPCI}`,
      ],
      metadata: {
        minPCI: item.minPCI,
        maxPCI: item.maxPCI,
        baseRate: item.baseRate,
        pavetype: item.pavetype,
      },
    })),
    ...getGDOTGuideSections().map((item) => ({
      id: item.id,
      title: item.title,
      category: 'guidance',
      summary: item.title,
      content: item.content,
      tags: ['GDOT', 'preservation', 'guidance', 'treatment', 'defects'],
      metadata: { section: item.section, source: 'GDOT Preservation Guide' },
    })),
    ...get2024BidTabulation().map((item) => ({
      id: item.id,
      title: item.title || `${item.title} - ${item.range}`,
      category: 'cost',
      summary: item.title,
      content: item.content || `${item.title}: ${item.range}. ${item.note}`,
      tags: ['cost', 'bid', 'contractor', '2024', 'pricing'],
      metadata: { source: 'PTC 24-05 2024 Bid Tabulation', ...item },
    })),
    ...getIMS2023ReportData().map((item) => ({
      id: item.id,
      title: item.title,
      category: 'data',
      summary: item.title,
      content: item.content,
      tags: ['IMS', '2023', 'pavement', 'survey', 'Peachtree Corners'],
      metadata: { source: 'Peachtree Corners Report 2023.pdf', ...item },
    })),
    ...getIMS2015BaselineData().map((item) => ({
      id: item.id,
      title: item.title,
      category: 'data',
      summary: item.title,
      content: item.content,
      tags: ['IMS', '2015', 'baseline', 'historical', 'trend'],
      metadata: { source: 'Peachtree Corners 2015 Report', surveyDate: item.surveyDate },
    })),
  ];

  return allDocuments;
}

/**
 * Export as JSON for use in the browser
 */
export function exportKnowledgeBaseAsJSON(outputPath = './public/knowledge-base.json') {
  const kb = buildComprehensiveKnowledgeBase();
  fs.writeFileSync(outputPath, JSON.stringify(kb, null, 2));
  console.log(`Knowledge base exported to ${outputPath} (${kb.length} documents)`);
  return kb;
}
