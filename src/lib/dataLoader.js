/**
 * Data Loader for PavePal RAG System
 * Loads and processes data from JSON files and company docs
 */

/**
 * Load and parse JSON data from the data folder
 */
export async function loadRoadSegments() {
  try {
    const response = await fetch('/data/roadSegments (2).json');
    const data = await response.json();
    
    return data.features.map((feature) => ({
      id: feature._id || feature.properties.name,
      type: 'road_segment',
      name: feature.properties.name,
      centerlineId: feature.properties.centerline_id,
      speedLimit: feature.properties.speed_limit,
      roadClass: feature.properties.ROADCLASS,
      length: feature.properties.length,
      lengthKm: feature.properties.length_km,
      municipality: feature.properties.MUNILEFT || feature.properties.MUNIRIGHT,
      region: feature.region_id,
      defects: feature.properties.defects || {},
      scanned: feature.properties.scanned,
      coordinates: feature.geometry.coordinates,
      rawData: feature.properties,
    }));
  } catch (error) {
    console.warn('Could not load road segments:', error);
    return [];
  }
}

/**
 * Load and parse location data from the data folder
 */
export async function loadLocations() {
  try {
    const response = await fetch('/data/locations (2).json');
    const data = await response.json();
    
    return data.features.map((feature) => ({
      id: feature._id || feature.properties.name,
      type: 'location',
      name: feature.properties.name,
      roadName: feature.properties.road_name,
      imagePath: feature.properties.image_path,
      defects: feature.properties.defects || {},
      coordinates: feature.geometry.coordinates,
      roadId: feature.road_id,
      region: feature.region_id,
      rawData: feature.properties,
    }));
  } catch (error) {
    console.warn('Could not load locations:', error);
    return [];
  }
}

/**
 * Create knowledge base documents from loaded data and company info
 */
export async function createKnowledgeBase() {
  const [roadSegments, locations] = await Promise.all([
    loadRoadSegments(),
    loadLocations(),
  ]);

  const knowledgeBase = [
    // Company Information
    {
      id: 'company-overview',
      title: 'PavePal Company Overview',
      category: 'company',
      summary:
        'Road assessment platform focused on computer vision and maintenance planning.',
      content: `PavePal is a road assessment platform that helps users proactively maintain road networks. 
        It uses computer vision to detect road defects and road assets at a customer-defined inspection frequency. 
        Founded with the goal of turning inspection data into actionable maintenance decisions that are transparent and grounded in engineering guidance.`,
      tags: ['PavePal', 'road assessment', 'computer vision', 'defects', 'assets'],
    },

    // Project Scope
    {
      id: 'project-scope',
      title: 'Capstone Project Scope',
      category: 'project',
      summary:
        'Grounded AI retrieval across inspection data, guidance documents, and cost tables.',
      content: `The capstone focuses on retrieval quality and failure modes in a road maintenance context. 
        The goal is to connect structured road inspection data with unstructured engineering guidance and evaluate 
        whether an AI system can ground maintenance decisions transparently. This involves testing retrieval quality, 
        measuring grounding effectiveness, and identifying failure modes.`,
      tags: ['RAG', 'retrieval', 'grounding', 'evaluation', 'maintenance decisions'],
    },

    // Inspection Data Overview
    {
      id: 'inspection-data',
      title: 'Inspection Data Model',
      category: 'data',
      summary: `${roadSegments.length} road segments and ${locations.length} inspection locations with defect detections.`,
      content: `The live dataset includes GeoJSON road segments, image-level defect detections, and defect information. 
        Defect classes detected include transverse cracks, longitudinal cracks, block cracks, alligator cracks, potholes, 
        patching, repaired cracks, sealing, and manhole covers. Each location has geographic coordinates and associated road information.`,
      tags: ['inspection', 'road segments', 'defects', 'GeoJSON', 'locations', 'defect detection'],
    },

    // Road Infrastructure
    {
      id: 'road-infrastructure',
      title: 'Road Infrastructure Details',
      category: 'data',
      summary: `Detailed road segment information including maintenance status and infrastructure properties.`,
      content: `Road segments contain detailed infrastructure data including speed limits, road class (Private/Public), 
        ownership and maintenance information, municipality boundaries, and geographic coordinates. 
        Each segment is georeferenced with LineString coordinates for precise mapping. 
        Segments track whether they have been scanned and contain defect information.`,
      tags: ['road', 'infrastructure', 'municipality', 'speed limit', 'maintenance', 'geography'],
    },

    // GDOT Preservation Guide
    {
      id: 'gdot-guide',
      title: 'GDOT Pavement Preservation Guide',
      category: 'guide',
      summary:
        'Authoritative engineering guidance for preservation and treatment selection.',
      content: `The GDOT Pavement Preservation Guide serves as the grounding reference for treatment selection, 
        construction procedures, and QA/QC. It is the primary rule book for answering what repair is appropriate 
        for a given condition and defect type. The guide provides evidence-based engineering guidance for pavement maintenance.`,
      tags: [
        'GDOT',
        'preservation',
        'treatment selection',
        'engineering guidance',
        'repair recommendations',
      ],
    },

    // Defect Information
    {
      id: 'defect-classification',
      title: 'Pavement Defect Classification',
      category: 'data',
      summary:
        'Taxonomy of pavement defects detected through computer vision inspection.',
      content: `Pavement defects are classified into distinct categories: transverse cracks run perpendicular to traffic, 
        longitudinal cracks run parallel to traffic, block cracks form rectangular patterns, alligator cracks are irregular networks, 
        potholes are surface depressions, patching indicates previous repairs, sealing shows sealed treatment, and manhole covers 
        are utility access points. Each defect type has different severity implications and treatment recommendations.`,
      tags: [
        'defects',
        'cracks',
        'potholes',
        'classification',
        'pavement condition',
        'severity',
      ],
    },

    // Data Summary
    {
      id: 'data-summary',
      title: 'Inspection Data Summary',
      category: 'data',
      summary: `Summary statistics of the road inspection dataset.`,
      content: `The inspection dataset contains information about ${roadSegments.length} distinct road segments 
        and ${locations.length} inspection locations with detailed defect information. 
        Data is organized by region (primarily USA Georgia Peachtree-Corners), with each location georeferenced 
        and linked to its parent road segment. The dataset tracks scanning status and defect occurrence patterns.`,
      tags: ['dataset', 'statistics', 'inspection', 'coverage', 'regions'],
    },
  ];

  return { knowledgeBase, roadSegments, locations };
}

/**
 * Extract defect summary from road segments and locations
 */
export function getDefectSummary(roadSegments, locations) {
  const defectCounts = {};
  const locationDefectCounts = {};

  roadSegments.forEach((segment) => {
    Object.keys(segment.defects).forEach((defect) => {
      defectCounts[defect] = (defectCounts[defect] || 0) + 1;
    });
  });

  locations.forEach((location) => {
    Object.keys(location.defects).forEach((defect) => {
      locationDefectCounts[defect] = (locationDefectCounts[defect] || 0) + 1;
    });
  });

  return { defectCounts, locationDefectCounts, roadSegments, locations };
}
