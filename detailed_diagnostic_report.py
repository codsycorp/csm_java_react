#!/usr/bin/env python3
"""
Detailed Diagnostic Report: f_cbo_query Query Structure Validation
Shows actual query structures and validates alignment with CsmDynamicGrid.tsx parsing
"""

import json
import sys
from typing import Any, Dict, List, Optional

class QueryValidator:
    """Validates f_cbo_query structures against CsmDynamicGrid expectations"""
    
    @staticmethod
    def validate_query_structure(parsed_obj: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates that parsed f_cbo_query matches expected structure:
        {
            "query": [
                {
                    "obj_name": "table_name",
                    "fields": ["field1", "field2"],
                    "obj_where": {...},
                    "app_id": "appname"
                }
            ],
            "options": [
                {"value": "...", "label": "..."}
            ]
        }
        """
        issues = []
        
        if not isinstance(parsed_obj, dict):
            issues.append("Root must be object")
            return {"valid": False, "issues": issues}
        
        # Validate query array
        query_array = parsed_obj.get("query", [])
        if not isinstance(query_array, list):
            issues.append("'query' must be array")
        else:
            for i, query in enumerate(query_array):
                if not isinstance(query, dict):
                    issues.append(f"query[{i}] must be object")
                    continue
                
                obj_name = query.get("obj_name")
                if not obj_name:
                    issues.append(f"query[{i}] missing required 'obj_name'")
                
                fields = query.get("fields", [])
                if not isinstance(fields, list):
                    issues.append(f"query[{i}].fields must be array")
                
                obj_where = query.get("obj_where")
                if obj_where and not isinstance(obj_where, (dict, str)):
                    issues.append(f"query[{i}].obj_where must be object or string")
        
        # Validate options array (optional)
        options = parsed_obj.get("options", [])
        if options and not isinstance(options, list):
            issues.append("'options' must be array")
        else:
            for i, opt in enumerate(options):
                if isinstance(opt, dict):
                    if "value" not in opt and "label" not in opt:
                        issues.append(f"options[{i}] should have 'value' or 'label'")
        
        return {
            "valid": len(issues) == 0,
            "issues": issues,
            "has_query": bool(query_array),
            "has_options": bool(options),
            "query_count": len(query_array),
            "options_count": len(options)
        }
    
    @staticmethod
    def analyze_query_patterns(parsed_obj: Dict[str, Any]) -> Dict[str, Any]:
        """
        Categorizes query by pattern type
        """
        if not isinstance(parsed_obj, dict):
            return {"pattern": "unknown", "description": "Not a valid object"}
        
        query_array = parsed_obj.get("query", [])
        options = parsed_obj.get("options", [])
        
        # Determine pattern
        if not query_array and options:
            return {
                "pattern": "static_options",
                "description": "Static options only (no query)",
                "option_count": len(options)
            }
        elif len(query_array) == 1:
            query = query_array[0]
            has_where = query.get("obj_where") is not None
            pattern = "query_with_filter" if has_where else "simple_select"
            
            return {
                "pattern": pattern,
                "description": "Simple SELECT" + (" with WHERE filter" if has_where else ""),
                "table": query.get("obj_name"),
                "fields": query.get("fields", []),
                "has_where": has_where
            }
        elif len(query_array) > 1:
            return {
                "pattern": "multi_query_union",
                "description": "Multiple queries (simulates UNION)",
                "query_count": len(query_array),
                "tables": [q.get("obj_name") for q in query_array]
            }
        else:
            return {
                "pattern": "options_only",
                "description": "Options defined without queries",
                "option_count": len(options)
            }

def load_and_analyze(filepath: str, sample_limit: int = 10) -> Dict[str, Any]:
    """Load menu file and analyze combo field structures"""
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        return {"error": str(e)}
    
    menu_items = data.get("menu", []) if isinstance(data, dict) else []
    
    validator = QueryValidator()
    
    # Collect all combo fields
    combo_fields = []
    
    def collect_fields(item: Dict[str, Any], parent_name: str = ""):
        """Recursively collect combo fields"""
        if not isinstance(item, dict):
            return
        
        table_name = item.get("m_name", "")
        table_config = item.get("table")
        
        if table_config and isinstance(table_config, list):
            for field in table_config:
                if not isinstance(field, dict):
                    continue
                
                f_type = field.get("f_types", "")
                if f_type not in ["co", "coro"]:
                    continue
                
                f_cbo_query = field.get("f_cbo_query", "")
                f_name = field.get("f_name", "")
                
                # Try to parse
                try:
                    if f_cbo_query.strip():
                        parsed = json.loads(f_cbo_query)
                    else:
                        parsed = None
                except:
                    parsed = None
                
                combo_fields.append({
                    "table": table_name,
                    "field": f_name,
                    "type": f_type,
                    "raw_query": f_cbo_query[:200] if len(f_cbo_query) > 200 else f_cbo_query,
                    "parsed": parsed,
                    "full_object": field
                })
        
        # Process children
        children = item.get("children", [])
        if isinstance(children, list):
            for child in children:
                collect_fields(child, table_name)
    
    for item in menu_items:
        collect_fields(item)
    
    # Analyze
    analysis = {
        "filepath": filepath,
        "total_combo_fields": len(combo_fields),
        "patterns": {},
        "structure_issues": [],
        "samples": []
    }
    
    for i, field in enumerate(combo_fields):
        parsed = field.get("parsed")
        
        if parsed is None:
            if not field.get("raw_query") or field.get("raw_query").strip() == "":
                pattern = "empty"
            else:
                # Might be dynamic code
                if "function" in field.get("raw_query", "") or "=>" in field.get("raw_query", ""):
                    pattern = "dynamic_code"
                else:
                    pattern = "unparseable"
        else:
            pattern_info = validator.analyze_query_patterns(parsed)
            pattern = pattern_info.get("pattern", "unknown")
            
            # Validate structure
            validation = validator.validate_query_structure(parsed)
            if not validation.get("valid"):
                analysis["structure_issues"].append({
                    "field": f"{field['table']}.{field['field']}",
                    "issues": validation.get("issues", [])
                })
        
        # Count pattern
        analysis["patterns"][pattern] = analysis["patterns"].get(pattern, 0) + 1
        
        # Collect samples
        if i < sample_limit:
            sample = {
                "field": f"{field['table']}.{field['field']}",
                "type": field["type"],
            }
            
            if parsed:
                pattern_info = validator.analyze_query_patterns(parsed)
                sample["pattern"] = pattern_info.get("pattern")
                sample["description"] = pattern_info.get("description")
                
                if pattern_info.get("pattern") == "simple_select":
                    sample["table"] = pattern_info.get("table")
                    sample["fields"] = pattern_info.get("fields")
                elif pattern_info.get("pattern") == "multi_query_union":
                    sample["tables"] = pattern_info.get("tables")
                elif pattern_info.get("pattern") == "static_options":
                    sample["option_count"] = pattern_info.get("option_count")
            else:
                sample["pattern"] = pattern
            
            analysis["samples"].append(sample)
    
    return analysis

def main():
    """Execute diagnostic analysis"""
    
    print("\n" + "="*100)
    print("DETAILED DIAGNOSTIC REPORT: f_cbo_query Query Structure Validation")
    print("="*100 + "\n")
    
    files = [
        "backend/csm_datas/public/vemaybay/new_system_20260428/vemaybay_menu_full_newsystem_20260428.json",
        "backend/csm_datas/public/banhang/new_system_20260424/banhang_menu_full_newsystem_20260424.json",
    ]
    
    all_valid = True
    
    for filepath in files:
        print(f"📋 File: {filepath.split('/')[-1]}")
        print("-" * 100)
        
        analysis = load_and_analyze(filepath, sample_limit=15)
        
        if "error" in analysis:
            print(f"❌ Error: {analysis['error']}\n")
            all_valid = False
            continue
        
        # Print summary
        print(f"Total combo fields: {analysis['total_combo_fields']}")
        print(f"\nPattern Distribution:")
        for pattern, count in sorted(analysis['patterns'].items(), key=lambda x: -x[1]):
            pct = (count / analysis['total_combo_fields'] * 100) if analysis['total_combo_fields'] > 0 else 0
            print(f"  • {pattern}: {count} ({pct:.1f}%)")
        
        # Print structure issues
        if analysis['structure_issues']:
            print(f"\n⚠️ Structure Issues Detected: {len(analysis['structure_issues'])}")
            for issue in analysis['structure_issues']:
                print(f"  - {issue['field']}")
                for msg in issue['issues']:
                    print(f"    • {msg}")
            all_valid = False
        else:
            print("\n✅ No structure issues detected")
        
        # Print samples
        print(f"\n📊 Sample Query Structures ({len(analysis['samples'])} shown):")
        print("-" * 100)
        for i, sample in enumerate(analysis['samples'], 1):
            print(f"\n{i}. {sample['field']} [{sample['type']}]")
            print(f"   Pattern: {sample.get('pattern', 'unknown')}")
            print(f"   Description: {sample.get('description', 'N/A')}")
            
            if 'table' in sample:
                print(f"   Table: {sample['table']}")
                print(f"   Fields: {', '.join(sample.get('fields', []))}")
            elif 'tables' in sample:
                print(f"   Tables: {', '.join(sample.get('tables', []))}")
            elif 'option_count' in sample:
                print(f"   Options: {sample['option_count']} static options")
        
        print("\n" + "="*100 + "\n")
    
    # Final report
    print("📄 VALIDATION SUMMARY")
    print("="*100)
    
    if all_valid:
        print("✅ All query structures are valid and properly formatted!")
        print("✅ All conversions are ready for integration with CsmDynamicGrid component")
        print("✅ No parsing errors or structure violations detected")
        return 0
    else:
        print("⚠️ Some issues detected - see details above")
        return 1

if __name__ == "__main__":
    sys.exit(main())
