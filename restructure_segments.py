"""
Restructure value.json and volume.json to use 3 new segment types:
1. By Product Type X Feeding Stage X Ingredients
2. By Functional Enrichment Profile Stage
3. By Distribution Channel Stage

Reads existing value.json and redistributes product type totals across
feeding stages and ingredient categories using proportional weights.
"""
import json
import copy
import os
import random

random.seed(42)

INPUT_VALUE = 'public/data/value.json'
INPUT_VOLUME = 'public/data/volume.json'
OUTPUT_VALUE = 'public/data/value.json'
OUTPUT_VOLUME = 'public/data/volume.json'

YEARS = [str(y) for y in range(2020, 2037)]

# ─── Product type name mapping (original → new display name) ─────────────────
PRODUCT_NAME_MAP = {
    # Normalise British "Hydrolysed" to American "Hydrolized" as shown in the images
    "Comfort / Partially Hydrolysed Standard Infant Formula":
        "Comfort / Partially Hydrolized Standard Infant Formula",
}

# ─── Stage proportions per product type (use NEW names as keys) ───────────────
STAGE_PROPS = {
    "Conventional Standard Infant Formula": {
        "Stage 1": 0.40, "Stage 2": 0.35, "Stage 3": 0.25
    },
    "Organic / Clean-Label Standard Infant Formula": {
        "Stage 1": 0.42, "Stage 2": 0.33, "Stage 3": 0.25
    },
    "Plant-Based Standard Infant Formula": {
        "Stage 1": 0.45, "Stage 2": 0.32, "Stage 3": 0.23
    },
    "Comfort / Partially Hydrolized Standard Infant Formula": {
        "Stage 1": 0.55, "Stage 2": 0.45
    },
}

# ─── Ingredient category proportions within each stage ───────────────────────
CAT_PROPS = {
    "Proteins":   0.35,
    "Lipids":     0.20,
    "Probiotics": 0.15,
    "Prebiotics": 0.15,
    "HMOs":       0.15,
}

# ─── Individual ingredient proportions within each category ──────────────────
# Keyed by (product_type_key, category)
INGREDIENT_PROPS = {
    # Conventional & Organic – standard protein mix
    ("conventional", "Proteins"): {
        "Whey protein": 0.30, "Whey protein isolate": 0.25,
        "Casein": 0.25, "Demineralized whey": 0.20,
    },
    # Conventional & Organic Stage 3 adds partially hydrolysed
    ("conventional_s3", "Proteins"): {
        "Whey protein": 0.25, "Whey protein isolate": 0.20,
        "Casein": 0.20, "Demineralized whey": 0.15,
        "Partially hydrolysed whey protein": 0.20,
    },
    # Organic same as conventional for Stage 1 & 2
    ("organic", "Proteins"): {
        "Whey protein": 0.30, "Whey protein isolate": 0.25,
        "Casein": 0.25, "Demineralized whey": 0.20,
    },
    ("organic_s3", "Proteins"): {
        "Whey protein": 0.30, "Whey protein isolate": 0.25,
        "Casein": 0.25, "Demineralized whey": 0.20,
    },
    # Plant-based proteins
    ("plant_based", "Proteins"): {
        "Soy protein": 0.45, "Rice protein": 0.30,
        "Other plant proteins": 0.25,
    },
    # Comfort proteins
    ("comfort", "Proteins"): {
        "Partially hydrolized whey protein": 1.0,
    },
    # Standard lipids (all except plant-based use same)
    ("standard", "Lipids"): {
        "DHA": 0.40, "ARA": 0.35, "DHA + ARA blends": 0.25,
    },
    # Standard probiotics
    ("standard", "Probiotics"): {
        "Bifidobacterium species": 0.40,
        "Lactobacillus species": 0.40,
        "Other probiotic species": 0.20,
    },
    # Standard prebiotics
    ("standard", "Prebiotics"): {
        "GOS": 0.25, "FOS": 0.25, "Inulin": 0.20,
        "GOS/FOS": 0.15, "Other prebiotic fibres": 0.15,
    },
    # Plant-based prebiotics (no FOS)
    ("plant_based", "Prebiotics"): {
        "GOS": 0.30, "Inulin": 0.25,
        "GOS/FOS": 0.25, "Other prebiotic fibres": 0.20,
    },
    # Standard HMOs
    ("standard", "HMOs"): {
        "2'FL": 0.30, "LnNT": 0.25, "2'FL + LnNT blends": 0.25,
        "Other single HMOs": 0.10, "Multi-HMO systems": 0.10,
    },
}


def get_ingredient_key(product_name, stage_name, category):
    """Return the ingredient proportion key for a given product/stage/category."""
    if category == "Lipids":
        return ("standard", "Lipids")
    if category == "Probiotics":
        return ("standard", "Probiotics")
    if category == "HMOs":
        return ("standard", "HMOs")

    if "Plant-Based" in product_name:
        if category == "Proteins":
            return ("plant_based", "Proteins")
        if category == "Prebiotics":
            return ("plant_based", "Prebiotics")

    if "Comfort" in product_name:
        if category == "Proteins":
            return ("comfort", "Proteins")
        if category == "Prebiotics":
            return ("standard", "Prebiotics")

    if "Organic" in product_name:
        if category == "Proteins":
            if stage_name == "Stage 3":
                return ("organic_s3", "Proteins")
            return ("organic", "Proteins")
        if category == "Prebiotics":
            return ("standard", "Prebiotics")

    # Conventional
    if category == "Proteins":
        if stage_name == "Stage 3":
            return ("conventional_s3", "Proteins")
        return ("conventional", "Proteins")
    if category == "Prebiotics":
        return ("standard", "Prebiotics")

    return ("standard", category)


def extract_year_values(node):
    """Extract {year: value} dict from a node that may have year data."""
    return {y: node.get(y, 0) for y in YEARS if y in node}


def scale_years(year_values, proportion):
    """Scale year values by a proportion, rounded to 1 decimal."""
    return {y: round(v * proportion, 1) for y, v in year_values.items()}


def build_combined_segment(product_types_data):
    """
    Build the 'By Product Type X Feeding Stage X Ingredients' structure
    from the existing 'By Product Type' data.
    
    product_types_data: dict of product_name -> {year: value, ...} (totals only)
    Returns nested dict ready for the new segment type.
    """
    result = {}

    for raw_product_name, product_node in product_types_data.items():
        # Apply name mapping (e.g. British -> American spelling)
        product_name = PRODUCT_NAME_MAP.get(raw_product_name, raw_product_name)

        # Get total year values for this product type
        product_year_values = extract_year_values(product_node)
        if not product_year_values:
            continue

        stage_props = STAGE_PROPS.get(product_name)
        if not stage_props:
            # Unknown product type – skip
            print(f"    WARNING: No stage proportions for product type: {product_name!r}")
            continue

        # Product type total (aggregated node)
        product_entry = {y: v for y, v in product_year_values.items()}
        product_entry["_aggregated"] = True
        result[product_name] = product_entry

        for stage_name, stage_prop in stage_props.items():
            stage_year_values = scale_years(product_year_values, stage_prop)

            # Stage total (aggregated node)
            stage_entry = {y: v for y, v in stage_year_values.items()}
            stage_entry["_aggregated"] = True
            result[product_name][stage_name] = stage_entry

            for cat_name, cat_prop in CAT_PROPS.items():
                cat_year_values = scale_years(stage_year_values, cat_prop)

                # Category total (aggregated node)
                cat_entry = {y: v for y, v in cat_year_values.items()}
                cat_entry["_aggregated"] = True
                result[product_name][stage_name][cat_name] = cat_entry

                # Individual ingredients
                ing_key = get_ingredient_key(product_name, stage_name, cat_name)
                ing_props = INGREDIENT_PROPS.get(ing_key, {})

                # Normalise proportions (in case they don't sum to 1)
                total_prop = sum(ing_props.values()) or 1.0

                for ing_name, ing_prop in ing_props.items():
                    normalised = ing_prop / total_prop
                    ing_year_values = scale_years(cat_year_values, normalised)
                    result[product_name][stage_name][cat_name][ing_name] = ing_year_values

    return result


def restructure_geo(geo_data):
    """
    Restructure a single geography's segment data to use the 3 new segment types.
    Returns a new dict with only the new segment types (plus By Region).
    """
    new_geo = {}

    # ── 1. Build combined Product Type × Stage × Ingredient segment ──────────
    old_product_data = geo_data.get("By Product Type", {})
    if old_product_data:
        combined = build_combined_segment(old_product_data)
        new_geo["By Product Type X Feeding Stage X Ingredients"] = combined

    # ── 2. Rename Functional Enrichment Profile → ...Stage, normalise keys ─────
    FEP_KEY_MAP = {
        "Core nutrition formula": "Core Nutrition Formula",
    }
    old_fep = geo_data.get("By Functional Enrichment Profile", {})
    if old_fep:
        normalised_fep = {FEP_KEY_MAP.get(k, k): v for k, v in old_fep.items()}
        new_geo["By Functional Enrichment Profile Stage"] = normalised_fep

    # ── 3. Rename Distribution Channel → ...Stage ────────────────────────────
    old_dc = geo_data.get("By Distribution Channel", {})
    if old_dc:
        new_geo["By Distribution Channel Stage"] = copy.deepcopy(old_dc)

    # ── 4. Keep By Region unchanged for geography filtering ───────────────────
    old_region = geo_data.get("By Region", {})
    if old_region:
        new_geo["By Region"] = copy.deepcopy(old_region)

    return new_geo


def restructure_json(data):
    """Restructure entire value/volume JSON."""
    new_data = {}
    for geo, geo_data in data.items():
        print(f"  Processing {geo}...")
        new_data[geo] = restructure_geo(geo_data)
    return new_data


def generate_volume_from_value(value_data):
    """Generate volume data from value data using conversion factors."""
    def walk(node, depth=0):
        if not isinstance(node, dict):
            return node

        has_year = any(str(k).isdigit() for k in node)
        has_children = any(isinstance(v, dict) for v in node.values())

        if has_year:
            base_val = next(
                (v for k, v in node.items()
                 if str(k).isdigit() and isinstance(v, (int, float))), 1
            )
            if base_val > 10000:
                factor = random.uniform(400, 800)
            elif base_val > 1000:
                factor = random.uniform(800, 1500)
            else:
                factor = random.uniform(1500, 3000)

            result = {}
            for k, v in node.items():
                if isinstance(v, dict):
                    result[k] = walk(v, depth + 1)
                elif str(k).isdigit() and isinstance(v, (int, float)):
                    result[k] = round(v * factor)
                else:
                    result[k] = v
            return result
        else:
            return {k: walk(v, depth + 1) for k, v in node.items()}

    return walk(value_data)


def main():
    print("Reading value.json...")
    with open(INPUT_VALUE, 'r', encoding='utf-8') as f:
        value_data = json.load(f)
    print(f"  Loaded {len(value_data)} geographies")

    print("\nRestructuring value.json...")
    new_value = restructure_json(value_data)

    # Verify structure
    first_geo = next(iter(new_value))
    seg_types = list(new_value[first_geo].keys())
    print(f"\nNew segment types in {first_geo}: {seg_types}")

    # Check combined segment structure
    combined = new_value[first_geo].get("By Product Type X Feeding Stage X Ingredients", {})
    for pt, pt_data in combined.items():
        stages = [k for k in pt_data if not str(k).isdigit() and k != '_aggregated']
        print(f"  {pt}: stages = {stages}")
        if stages:
            first_stage = stages[0]
            cats = [k for k in pt_data[first_stage]
                    if not str(k).isdigit() and k != '_aggregated']
            print(f"    {first_stage} categories: {cats}")

    print("\nWriting new value.json...")
    with open(OUTPUT_VALUE, 'w', encoding='utf-8') as f:
        json.dump(new_value, f, indent=2)
    print("  Done!")

    print("\nGenerating volume.json...")
    volume_data = generate_volume_from_value(new_value)
    with open(OUTPUT_VOLUME, 'w', encoding='utf-8') as f:
        json.dump(volume_data, f, indent=2)
    print("  Done!")

    print("\nRestructuring complete!")


if __name__ == '__main__':
    main()
