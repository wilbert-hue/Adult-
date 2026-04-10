/**
 * Generate adult medical nutrition JSON data files.
 * Creates value.json, volume.json, and segmentation_analysis.json
 * with the new segment structure matching the images.
 */

const fs = require('fs');
const path = require('path');

// ─── Geographies ────────────────────────────────────────────────────────────
const INDIVIDUAL_GEOS = [
  'U.S.', 'Canada',
  'Germany', 'France', 'UK', 'Italy', 'Spain',
  'Rest of Western Europe', 'Eastern Europe',
  'China', 'Vietnam', 'Singapore', 'Japan', 'South Korea',
  'Thailand', 'Indonesia', 'Malaysia', 'India', 'Pakistan',
  'Rest of Asia Pacific',
  'Brazil', 'Mexico', 'Rest of Latin America'
];

const REGIONAL_GEOS = ['North America', 'Europe', 'Asia Pacific', 'Latin America', 'Global'];

const ALL_GEOS = [...INDIVIDUAL_GEOS, ...REGIONAL_GEOS];

// Geographic share of global market (must sum to ~1 for individual, then regions are sums)
const GEO_SHARE = {
  'U.S.':                    0.310,
  'Canada':                  0.060,
  'Germany':                 0.055,
  'France':                  0.040,
  'UK':                      0.050,
  'Italy':                   0.030,
  'Spain':                   0.025,
  'Rest of Western Europe':  0.035,
  'Eastern Europe':          0.020,
  'China':                   0.095,
  'Vietnam':                 0.010,
  'Singapore':               0.008,
  'Japan':                   0.048,
  'South Korea':             0.022,
  'Thailand':                0.010,
  'Indonesia':               0.012,
  'Malaysia':                0.008,
  'India':                   0.035,
  'Pakistan':                0.008,
  'Rest of Asia Pacific':    0.022,
  'Brazil':                  0.022,
  'Mexico':                  0.015,
  'Rest of Latin America':   0.010,
};

const REGIONAL_MEMBERS = {
  'North America':  ['U.S.', 'Canada'],
  'Europe':         ['Germany', 'France', 'UK', 'Italy', 'Spain', 'Rest of Western Europe', 'Eastern Europe'],
  'Asia Pacific':   ['China', 'Vietnam', 'Singapore', 'Japan', 'South Korea', 'Thailand', 'Indonesia', 'Malaysia', 'India', 'Pakistan', 'Rest of Asia Pacific'],
  'Latin America':  ['Brazil', 'Mexico', 'Rest of Latin America'],
};

// ─── Years ───────────────────────────────────────────────────────────────────
const YEARS = Array.from({ length: 17 }, (_, i) => 2020 + i); // 2020–2036

// ─── Segment Hierarchy ───────────────────────────────────────────────────────
// Each leaf is: { name, share (fraction of parent), cagr }

const HIERARCHY = {
  'By Product Type X Ingredients': {
    'Oral Nutritional Supplements': {
      _share: 0.51,
      _cagr: 0.072,
      'By Protein and Amino Acid': {
        _share: 0.32,
        _cagr: 0.074,
        leaves: [
          { name: 'Whey protein',             share: 0.18 },
          { name: 'Casein protein',            share: 0.12 },
          { name: 'Soy protein',               share: 0.10 },
          { name: 'Pea protein',               share: 0.13 },
          { name: 'Leucine-enriched protein',  share: 0.09 },
          { name: 'HMB-containing',            share: 0.07 },
          { name: 'BCAA-enriched',             share: 0.08 },
          { name: 'Arginine-containing',       share: 0.07 },
          { name: 'Glutamine-containing',      share: 0.07 },
          { name: 'Collagen peptide',          share: 0.06 },
          { name: 'Bioactive peptide',         share: 0.03 },
        ]
      },
      'By Lipid': {
        _share: 0.22,
        _cagr: 0.065,
        leaves: [
          { name: 'Omega-3 EPA/DHA',          share: 0.30 },
          { name: 'Fish-derived omega-3',      share: 0.25 },
          { name: 'Algal omega-3',             share: 0.18 },
          { name: 'MCT-containing lipid',      share: 0.15 },
          { name: 'High-energy lipid blends',  share: 0.12 },
        ]
      },
      'By Carbohydrate and Fibre': {
        _share: 0.24,
        _cagr: 0.060,
        leaves: [
          { name: 'Standard carbohydrate',       share: 0.25 },
          { name: 'Low-glycaemic carbohydrate',  share: 0.20 },
          { name: 'Soluble fibre',               share: 0.18 },
          { name: 'Resistant starch',            share: 0.14 },
          { name: 'FOS-containing',              share: 0.13 },
          { name: 'Fibre-enriched blends',       share: 0.10 },
        ]
      },
      'By Microbiome Support': {
        _share: 0.12,
        _cagr: 0.085,
        leaves: [
          { name: 'Probiotic-containing',  share: 0.42 },
          { name: 'Prebiotic-containing',  share: 0.35 },
          { name: 'Synbiotic',             share: 0.23 },
        ]
      },
      'By Micronutrient / Recovery Support': {
        _share: 0.10,
        _cagr: 0.068,
        leaves: [
          { name: 'Zinc-enriched',                        share: 0.30 },
          { name: 'Vitamin and mineral premixes',         share: 0.45 },
          { name: 'Disease-support micronutrient blends', share: 0.25 },
        ]
      },
    },

    'Enteral Nutrition': {
      _share: 0.34,
      _cagr: 0.068,
      'By Protein and Amino Acid': {
        _share: 0.35,
        _cagr: 0.070,
        leaves: [
          { name: 'Whey protein',           share: 0.15 },
          { name: 'Casein protein',         share: 0.11 },
          { name: 'Soy protein',            share: 0.09 },
          { name: 'Pea protein',            share: 0.10 },
          { name: 'Hydrolysed protein',     share: 0.14 },
          { name: 'Peptide-based protein',  share: 0.13 },
          { name: 'Elemental amino acid',   share: 0.10 },
          { name: 'BCAA-enriched',          share: 0.08 },
          { name: 'Arginine-containing',    share: 0.06 },
          { name: 'Glutamine-containing',   share: 0.04 },
        ]
      },
      'By Lipid': {
        _share: 0.22,
        _cagr: 0.062,
        leaves: [
          { name: 'Omega-3 EPA/DHA',          share: 0.35 },
          { name: 'MCT-containing lipid',      share: 0.30 },
          { name: 'Structured lipid',          share: 0.20 },
          { name: 'Energy-dense lipid blends', share: 0.15 },
        ]
      },
      'By Carbohydrate and Fibre': {
        _share: 0.20,
        _cagr: 0.058,
        leaves: [
          { name: 'Standard carbohydrate',       share: 0.26 },
          { name: 'Low-glycaemic carbohydrate',  share: 0.20 },
          { name: 'Soluble fibre',               share: 0.17 },
          { name: 'Resistant starch',            share: 0.13 },
          { name: 'FOS-containing',              share: 0.14 },
          { name: 'Fibre-modified',              share: 0.10 },
        ]
      },
      'By Microbiome Support Ingredients': {
        _share: 0.12,
        _cagr: 0.082,
        leaves: [
          { name: 'Prebiotic-containing',  share: 0.38 },
          { name: 'Probiotic-containing',  share: 0.40 },
          { name: 'Synbiotic',             share: 0.22 },
        ]
      },
      'By Functional Protein / Peptide': {
        _share: 0.11,
        _cagr: 0.078,
        leaves: [
          { name: 'Bioactive peptides',                  share: 0.38 },
          { name: 'Functional protein concentrates',     share: 0.35 },
          { name: 'Condition-specific peptide blends',   share: 0.27 },
        ]
      },
    },

    'Parenteral Nutrition-Linked Nutrient': {
      _share: 0.15,
      _cagr: 0.055,
      'By Amino Acid': {
        _share: 0.30,
        _cagr: 0.057,
        leaves: [
          { name: 'Standard amino acid blends',           share: 0.35 },
          { name: 'Condition-specific amino acid blends', share: 0.28 },
          { name: 'BCAA-enriched amino acid',             share: 0.22 },
          { name: 'Glutamine-containing',                 share: 0.15 },
        ]
      },
      'By Lipid': {
        _share: 0.28,
        _cagr: 0.052,
        leaves: [
          { name: 'Soy-based lipid emulsions',         share: 0.22 },
          { name: 'MCT/LCT lipid emulsions',           share: 0.25 },
          { name: 'Olive oil-based lipid emulsions',   share: 0.18 },
          { name: 'Fish oil-containing lipid emulsions', share: 0.20 },
          { name: 'Mixed-lipid emulsion',              share: 0.15 },
        ]
      },
      'By Carbohydrate': {
        _share: 0.20,
        _cagr: 0.048,
        leaves: [
          { name: 'Dextrose',             share: 0.68 },
          { name: 'Energy carbohydrate',  share: 0.32 },
        ]
      },
      'By Micronutrient': {
        _share: 0.12,
        _cagr: 0.060,
        leaves: [] // Leaf itself
      },
      'Electrolyte blends': {
        _share: 0.10,
        _cagr: 0.055,
        leaves: [
          { name: 'Mineral',             share: 0.40 },
          { name: 'Vitamin premixes',    share: 0.35 },
          { name: 'Trace element premixes', share: 0.25 },
        ]
      },
    },
  },

  'By Formulation Role': {
    leaves: [
      { name: 'Protein Repletion and Muscle Maintenance Support', share: 0.12 },
      { name: 'Energy Density Enhancement',                       share: 0.10 },
      { name: 'Immune Support',                                   share: 0.09 },
      { name: 'Anti-Inflammatory Support',                        share: 0.08 },
      { name: 'Wound Healing and Tissue Repair Support',          share: 0.07 },
      { name: 'Glycaemic Control Support',                        share: 0.07 },
      { name: 'Digestive Tolerance Support',                      share: 0.07 },
      { name: 'Fat Absorption Support',                           share: 0.06 },
      { name: 'Renal Nutrition Support',                          share: 0.07 },
      { name: 'Hepatic Nutrition Support',                        share: 0.06 },
      { name: 'Respiratory Nutrition Support',                    share: 0.05 },
      { name: 'Oncology Recovery Support',                        share: 0.06 },
      { name: 'Malabsorption Support',                            share: 0.05 },
      { name: 'General Disease-Related Malnutrition Support',     share: 0.07 },
      { name: 'Multi-Functional Clinical Nutrition Support',      share: 0.08 },
    ],
    _cagr: 0.065,
  },

  'By Distribution Channel': {
    leaves: [
      { name: 'Hospital',                                           share: 0.28 },
      { name: 'Retail Pharmacy / Drug Store/Compounding Pharmacy', share: 0.22 },
      { name: 'Long-Term Care',                                     share: 0.14 },
      { name: 'Homecare',                                           share: 0.12 },
      { name: 'Supermarket / Mass Retail',                          share: 0.10 },
      { name: 'E-Commerce / Online Retail',                         share: 0.08 },
      { name: 'Direct-to-Consumer',                                 share: 0.06 },
    ],
    _cagr: 0.067,
  },
};

// ─── Base Market Values (Global, 2020) ──────────────────────────────────────
// Total global adult medical nutrition market ~$14.5B in 2020
const GLOBAL_BASE_2020 = 14500; // USD million

// Segment type base allocations (as fraction of total)
const SEG_TYPE_BASE = {
  'By Product Type X Ingredients': 1.00,  // Same market, different view
  'By Formulation Role':           1.00,
  'By Distribution Channel':       1.00,
};

// ─── Helper: seeded pseudo-random ────────────────────────────────────────────
function seededRand(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

let _seedCounter = 0;
function nextRand(low = 0.97, high = 1.03) {
  _seedCounter++;
  const r = seededRand(_seedCounter * 137.5);
  return low + r * (high - low);
}

// ─── Generate year series ─────────────────────────────────────────────────────
function makeYearSeries(base2020, cagr, geoJitter = 1.0) {
  const result = {};
  const baseYear = 2024; // Estimate base year for CAGR calculation
  const startYear = 2020;
  
  let v2020 = base2020 * geoJitter;
  YEARS.forEach(y => {
    const yearOffset = y - startYear;
    // Pre-2020 to 2024: historical growth ~slightly different
    const historicalCagr = cagr * 0.9;
    const forecastCagr = cagr;
    const delta = y <= baseYear ? historicalCagr : forecastCagr;
    const val = v2020 * Math.pow(1 + delta, yearOffset) * nextRand(0.995, 1.005);
    result[String(y)] = Math.round(val * 10) / 10;
  });
  
  // CAGR: forecast period 2024-2033
  const cagr2024 = result['2024'];
  const cagr2033 = cagr2024 * Math.pow(1 + cagr, 9);
  result['CAGR'] = Math.round(((cagr2033 / cagr2024) ** (1/9) - 1) * 1000) / 10;
  
  return result;
}

// ─── Build segment data for a geography ────────────────────────────────────
function buildSegNode(nodeDef, geoBase, geoJitter, parentCagr) {
  // nodeDef can be:
  // - { leaves: [...], _cagr } => flat segment type
  // - { _share, _cagr, subgroups... } => hierarchical product type

  const result = {};

  // Flat segment type (By Formulation Role / By Distribution Channel)
  if (nodeDef.leaves !== undefined && !nodeDef._share) {
    const cagr = nodeDef._cagr || parentCagr || 0.065;
    nodeDef.leaves.forEach(leaf => {
      const base = geoBase * leaf.share;
      const series = makeYearSeries(base, cagr, geoJitter);
      result[leaf.name] = series;
    });
    return result;
  }

  // Hierarchical: By Product Type X Ingredients
  // Top-level keys are product types (ONS, Enteral, Parenteral)
  // We need to iterate over the nodeDef and handle sub-groups
  return buildProductTypeNode(nodeDef, geoBase, geoJitter);
}

function buildProductTypeNode(nodeDef, geoBase, geoJitter) {
  const result = {};

  for (const [key, val] of Object.entries(nodeDef)) {
    if (key.startsWith('_')) continue;

    const productBase = geoBase * val._share;
    const productCagr = val._cagr || 0.065;
    
    // Build parent year series for this product type
    const parentSeries = makeYearSeries(productBase, productCagr, geoJitter);
    
    // Build sub-category nodes
    const productObj = { ...parentSeries, _aggregated: true };

    for (const [subKey, subVal] of Object.entries(val)) {
      if (subKey.startsWith('_') || subKey === 'leaves') continue;
      
      const subBase = productBase * subVal._share;
      const subCagr = subVal._cagr || productCagr;
      
      const subSeries = makeYearSeries(subBase, subCagr, geoJitter);
      const subObj = { ...subSeries, _aggregated: true };
      
      // Build leaf nodes
      if (subVal.leaves && subVal.leaves.length > 0) {
        subVal.leaves.forEach(leaf => {
          const leafBase = subBase * leaf.share;
          const leafSeries = makeYearSeries(leafBase, subCagr, geoJitter);
          subObj[leaf.name] = leafSeries;
        });
      } else if (subVal.leaves && subVal.leaves.length === 0) {
        // By Micronutrient - leaf with no children, just year data
        // Handled by just the series
        delete subObj._aggregated;
      }
      
      productObj[subKey] = subObj;
    }
    
    result[key] = productObj;
  }
  
  return result;
}

// ─── Build full value JSON ────────────────────────────────────────────────────
function buildValueJson() {
  const result = {};

  // Process individual geographies first
  for (const geo of INDIVIDUAL_GEOS) {
    const geoShare = GEO_SHARE[geo] || 0.01;
    const geoBase = GLOBAL_BASE_2020 * geoShare;
    const geoJitter = nextRand(0.98, 1.02);

    result[geo] = {};

    for (const [segType, segDef] of Object.entries(HIERARCHY)) {
      const segBase = geoBase * (SEG_TYPE_BASE[segType] || 1.0);
      result[geo][segType] = buildSegNode(segDef, segBase, geoJitter, 0.065);
    }
  }

  // Compute regional aggregates by summing children
  for (const [region, members] of Object.entries(REGIONAL_MEMBERS)) {
    result[region] = {};
    for (const segType of Object.keys(HIERARCHY)) {
      result[region][segType] = sumNodes(members.map(m => result[m][segType]));
    }
  }

  // Compute Global by summing all regional members (North America + Europe + Asia Pacific + Latin America)
  result['Global'] = {};
  const allRegions = ['North America', 'Europe', 'Asia Pacific', 'Latin America'];
  for (const segType of Object.keys(HIERARCHY)) {
    result['Global'][segType] = sumNodes(allRegions.map(r => result[r][segType]));
  }

  return result;
}

// ─── Sum two nodes recursively ─────────────────────────────────────────────
function sumNodes(nodes) {
  if (!nodes || nodes.length === 0) return {};
  
  const result = {};
  const first = nodes[0];
  
  for (const key of Object.keys(first)) {
    if (key === '_aggregated') {
      result[key] = true;
      continue;
    }
    
    if (typeof first[key] === 'number') {
      // Year value or CAGR - sum across nodes (CAGR will be recalculated if needed)
      if (key === 'CAGR') {
        // Average CAGR weighted by 2024 value
        const total2024 = nodes.reduce((s, n) => s + (n['2024'] || 0), 0);
        if (total2024 > 0) {
          result['CAGR'] = Math.round(nodes.reduce((s, n) => s + (n['CAGR'] || 0) * (n['2024'] || 0), 0) / total2024 * 10) / 10;
        } else {
          result['CAGR'] = nodes[0]['CAGR'] || 0;
        }
      } else {
        result[key] = Math.round(nodes.reduce((s, n) => s + (n[key] || 0), 0) * 10) / 10;
      }
    } else if (typeof first[key] === 'object' && first[key] !== null) {
      // Sub-object: recurse
      result[key] = sumNodes(nodes.map(n => n[key] || {}));
    } else {
      result[key] = first[key];
    }
  }
  
  return result;
}

// ─── Generate volume from value ───────────────────────────────────────────────
function toVolume(node, depth = 0) {
  if (typeof node === 'number') return node; // Won't be called directly
  if (typeof node !== 'object' || node === null) return node;

  const result = {};
  const yearKeys = Object.keys(node).filter(k => /^\d{4}$/.test(k));
  
  // Determine volume factor based on value magnitude
  let factor = 1;
  if (yearKeys.length > 0) {
    const baseVal = node[yearKeys[0]] || 1;
    if (baseVal > 5000) factor = seededRand(depth * 13 + 7) * 400 + 300;
    else if (baseVal > 1000) factor = seededRand(depth * 13 + 7) * 600 + 600;
    else if (baseVal > 100) factor = seededRand(depth * 13 + 7) * 1000 + 1000;
    else factor = seededRand(depth * 13 + 7) * 2000 + 2000;
  }
  
  for (const [key, val] of Object.entries(node)) {
    if (/^\d{4}$/.test(key)) {
      result[key] = Math.round(val * factor);
    } else if (key === 'CAGR') {
      result[key] = val;
    } else if (key === '_aggregated') {
      result[key] = val;
    } else if (typeof val === 'object' && val !== null) {
      result[key] = toVolume(val, depth + 1);
    } else {
      result[key] = val;
    }
  }
  
  return result;
}

// ─── Build segmentation analysis JSON ────────────────────────────────────────
function buildSegmentationJson() {
  // Uses just one geography (Global) with empty leaf objects
  // Structure mirrors value.json but leaf nodes are {} instead of year data
  const result = {};

  result['Global'] = {};

  for (const [segType, segDef] of Object.entries(HIERARCHY)) {
    result['Global'][segType] = buildSegmentationNode(segDef);
  }

  return result;
}

function buildSegmentationNode(nodeDef) {
  if (nodeDef.leaves !== undefined && !nodeDef._share) {
    // Flat
    const obj = {};
    nodeDef.leaves.forEach(leaf => { obj[leaf.name] = {}; });
    return obj;
  }

  const result = {};
  for (const [key, val] of Object.entries(nodeDef)) {
    if (key.startsWith('_')) continue;
    
    const productObj = {};
    for (const [subKey, subVal] of Object.entries(val)) {
      if (subKey.startsWith('_') || subKey === 'leaves') continue;
      
      const subObj = {};
      if (subVal.leaves && subVal.leaves.length > 0) {
        subVal.leaves.forEach(leaf => { subObj[leaf.name] = {}; });
      }
      productObj[subKey] = subObj;
    }
    result[key] = productObj;
  }
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('Building value JSON...');
const valueData = buildValueJson();

console.log('Building volume JSON...');
const volumeData = {};
for (const [geo, segTypes] of Object.entries(valueData)) {
  volumeData[geo] = {};
  for (const [segType, data] of Object.entries(segTypes)) {
    volumeData[geo][segType] = toVolume(data);
  }
}

console.log('Building segmentation JSON...');
const segmentationData = buildSegmentationJson();

// Write files
const outDir = path.join(__dirname, 'public', 'data');
fs.writeFileSync(path.join(outDir, 'value.json'), JSON.stringify(valueData, null, 2));
console.log('✅ value.json written');

fs.writeFileSync(path.join(outDir, 'volume.json'), JSON.stringify(volumeData, null, 2));
console.log('✅ volume.json written');

fs.writeFileSync(path.join(outDir, 'segmentation_analysis.json'), JSON.stringify(segmentationData, null, 2));
console.log('✅ segmentation_analysis.json written');

// Verification
console.log('\n=== Verification ===');
const globalProdType = valueData['Global']['By Product Type X Ingredients'];
console.log('Product types:', Object.keys(globalProdType));
const ons = globalProdType['Oral Nutritional Supplements'];
console.log('ONS 2024:', ons['2024']);
console.log('ONS sub-categories:', Object.keys(ons).filter(k => !/^\d{4}$/.test(k) && k !== 'CAGR' && k !== '_aggregated'));

const globalFormRole = valueData['Global']['By Formulation Role'];
console.log('\nBy Formulation Role items:', Object.keys(globalFormRole).length);

const globalDist = valueData['Global']['By Distribution Channel'];
console.log('By Distribution Channel items:', Object.keys(globalDist).length);

console.log('\nGeographies:', Object.keys(valueData).length);
console.log('\nDone!');
