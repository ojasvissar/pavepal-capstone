export type SourceType = 'company' | 'project' | 'data' | 'guide' | 'cost';

export interface KnowledgeChunk {
  id: string;
  title: string;
  category: SourceType;
  summary: string;
  content: string;
  tags: string[];
}

export const knowledgeBase: KnowledgeChunk[] = [
  {
    id: 'company-overview',
    title: 'PavePal company overview',
    category: 'company',
    summary: 'Road assessment platform focused on computer vision and maintenance planning.',
    content:
      'PavePal is a road assessment platform that helps users proactively maintain road networks. It uses computer vision to detect road defects and road assets at a customer-defined inspection frequency.',
    tags: ['PavePal', 'road assessment', 'computer vision', 'defects', 'assets'],
  },
  {
    id: 'project-scope',
    title: 'Capstone project scope',
    category: 'project',
    summary: 'Ground AI retrieval across inspection data, guidance documents, and cost tables.',
    content:
      'The capstone focuses on retrieval quality and failure modes. The goal is to connect structured road inspection data with unstructured engineering guidance and evaluate whether an AI system can ground maintenance decisions transparently.',
    tags: ['RAG', 'retrieval', 'grounding', 'evaluation', 'maintenance decisions'],
  },
  {
    id: 'inspection-data',
    title: 'Inspection data model',
    category: 'data',
    summary: '20,829 image-level detections and 1,960 road segments with PCI scores.',
    content:
      'The live dataset includes GeoJSON road segments, image-level defect detections, and segment-level PCI scores. Defect classes include longitudinal cracks, transverse cracks, block cracks, alligator cracks, potholes, patching, repaired cracks, sealing, and manhole covers.',
    tags: ['PCI', 'road segments', 'defects', 'GeoJSON', 'inspection'],
  },
  {
    id: 'gdot-guide',
    title: 'GDOT preservation guide',
    category: 'guide',
    summary: 'Authoritative engineering guidance for preservation and treatment selection.',
    content:
      'The GDOT Pavement Preservation Guide serves as the grounding reference for treatment selection, construction procedures, and QA/QC. It is the primary rule book for answering what repair is appropriate for a given condition.',
    tags: ['GDOT', 'preservation', 'treatment selection', 'engineering guidance'],
  },
  {
    id: 'rehab-activities',
    title: 'Rehab activities and cost data',
    category: 'cost',
    summary: 'PCI bands map to rehab actions and unit costs, including 2024 bid tabulation prices.',
    content:
      'The rehab activities sheet links pavement type and PCI ranges to recommended actions and base rates. The 2024 bid tabulation adds real-world contractor pricing that can be used to ground cost estimates.',
    tags: ['rehab', 'cost', 'bid tabulation', 'unit rate', 'PCI band'],
  },
];

export const starterPrompts = [
  'What is PavePal and what does it do?',
  'How does the chatbot ground answers?',
  'What data sources are in the project?',
  'Why is the GDOT guide important?',
];
