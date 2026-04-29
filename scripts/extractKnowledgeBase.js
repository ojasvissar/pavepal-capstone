#!/usr/bin/env node

/**
 * Knowledge Base Extraction Script
 * Extracts and exports comprehensive knowledge base from all data sources
 * Usage: npm run extract-data
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getRehabActivities,
  getGDOTGuideSections,
  get2024BidTabulation,
  getIMS2023ReportData,
  getIMS2015BaselineData,
  buildComprehensiveKnowledgeBase,
} from '../src/lib/documentExtractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create output directory if it doesn't exist
const outputDir = path.join(__dirname, '../public/data');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🔍 Extracting PavePal Knowledge Base...\n');

// Build comprehensive knowledge base
const knowledgeBase = buildComprehensiveKnowledgeBase();

// Save to JSON file
const outputPath = path.join(outputDir, 'knowledge-base.json');
fs.writeFileSync(outputPath, JSON.stringify(knowledgeBase, null, 2));

console.log(`✅ Knowledge base exported: ${outputPath}`);
console.log(`   Total documents: ${knowledgeBase.length}`);

// Break down by category
const byCategory = {};
knowledgeBase.forEach((doc) => {
  if (!byCategory[doc.category]) {
    byCategory[doc.category] = 0;
  }
  byCategory[doc.category]++;
});

console.log('\n📊 Knowledge Base Breakdown:');
Object.entries(byCategory)
  .sort(([, a], [, b]) => b - a)
  .forEach(([category, count]) => {
    console.log(`   ${category.padEnd(20)} ${count} documents`);
  });

// Detailed summary
console.log('\n📚 Data Sources Included:');
console.log('   ✓ PavePal inspection data (JSON files)');
console.log('   ✓ Rehabilitation Activities table (ESA 2023)');
console.log('   ✓ GDOT Pavement Preservation Guide');
console.log('   ✓ 2024 Contractor Bid Tabulation');
console.log('   ✓ IMS 2023 Pavement Management Report');
console.log('   ✓ IMS 2015 Baseline Survey');

console.log('\n✨ Ready for RAG retrieval!\n');
