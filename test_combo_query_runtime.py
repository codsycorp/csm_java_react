#!/usr/bin/env python3
"""
Runtime Validation Test Suite for f_cbo_query Conversions
Simulates CsmDynamicGrid component parsing logic to validate converted queries
"""

import json
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

# ANSI color codes for output
class Colors:
    HEADER = '\033[95m'
    OK = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def colored(text: str, color: str) -> str:
    """Apply ANSI color to text"""
    return f"{color}{text}{Colors.ENDC}"

def parse_static_combo_query(input_str: str) -> Optional[Dict[str, Any]]:
    """
    Simulates parseStaticComboQuery from combo-utils.ts
    Attempts to parse JSON or JavaScript object literal
    """
    text = str(input_str or "").strip()
    if not text:
        return None
    
    # Check if it looks like JSON/object
    if not (text.startswith("{") or text.startswith("[")):
        return None
    
    # Try JSON parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    
    # Try JavaScript eval (simplified)
    try:
        # Simple JavaScript object literal support
        # Replace JavaScript-specific patterns
        sanitized = text.replace("true", "True").replace("false", "False").replace("null", "None")
        result = eval(sanitized)
        return result
    except:
        pass
    
    return None

def extract_combo_queries_from_field(field: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Simulates extractComboQueriesFromField from combo-utils.ts
    Extracts query specifications from field configuration
    """
    raw = str(field.get("f_cbo_query") or "").strip()
    if not raw:
        return []
    
    parsed = parse_static_combo_query(raw)
    if not parsed:
        return []
    
    queries = parsed.get("query", []) if isinstance(parsed, dict) else []
    if not isinstance(queries, list):
        queries = []
    
    result = []
    for q in queries:
        if not isinstance(q, dict):
            continue
        
        table_name = str(q.get("obj_name") or "").strip()
        if not table_name:
            continue
        
        result.append({
            "obj_name": table_name,
            "app_id": q.get("app_id"),
            "fields": q.get("fields", []),
            "obj_where": q.get("obj_where"),
        })
    
    return result

def analyze_combo_field(table_name: str, field_name: str, field: Dict[str, Any]) -> Dict[str, Any]:
    """
    Comprehensive analysis of a combo field configuration
    """
    f_cbo_query = field.get("f_cbo_query")
    f_type = field.get("f_types", "")
    
    if not f_cbo_query or f_cbo_query.strip() == "":
        return {
            "status": "empty",
            "table": table_name,
            "field": field_name,
            "type": f_type,
            "message": "No f_cbo_query defined"
        }
    
    # Try to parse
    parsed = parse_static_combo_query(str(f_cbo_query))
    
    if parsed is None:
        # Might be dynamic code (function)
        if f_cbo_query.strip().startswith("function") or "=>" in f_cbo_query or f_cbo_query.strip().startswith("async"):
            return {
                "status": "dynamic_code",
                "table": table_name,
                "field": field_name,
                "type": f_type,
                "query_preview": f_cbo_query[:100] + "..." if len(f_cbo_query) > 100 else f_cbo_query,
                "message": "Dynamic code detected"
            }
        else:
            return {
                "status": "parse_error",
                "table": table_name,
                "field": field_name,
                "type": f_type,
                "query_value": f_cbo_query,
                "message": f"Failed to parse f_cbo_query"
            }
    
    # Valid JSON/Object
    queries = extract_combo_queries_from_field(field)
    options = parsed.get("options", []) if isinstance(parsed, dict) else []
    
    analysis = {
        "status": "valid",
        "table": table_name,
        "field": field_name,
        "type": f_type,
        "query_count": len(queries),
        "has_options": len(options) > 0,
        "queries": []
    }
    
    # Analyze each query
    for q in queries:
        query_analysis = {
            "obj_name": q.get("obj_name"),
            "fields": q.get("fields", []),
            "has_where": q.get("obj_where") is not None,
            "field_count": len(q.get("fields", []))
        }
        analysis["queries"].append(query_analysis)
    
    # Analyze options
    if options:
        analysis["options_count"] = len(options)
        if len(options) > 0 and isinstance(options[0], dict):
            analysis["sample_option"] = options[0]
    
    return analysis

def validate_menu_file(filepath: str) -> Tuple[str, Dict[str, Any]]:
    """
    Load and validate all combo fields in a menu JSON file
    """
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        return filepath, {"status": "error", "message": f"Failed to load file: {e}"}
    
    # Extract menu structure
    menu_items = data.get("menu", []) if isinstance(data, dict) else []
    
    stats = {
        "filename": filepath,
        "total_items": len(menu_items),
        "combo_fields": {
            "total": 0,
            "valid": 0,
            "empty": 0,
            "parse_error": 0,
            "dynamic_code": 0,
        },
        "query_patterns": {
            "simple_select": 0,
            "multi_query": 0,
            "with_options": 0,
            "with_where": 0,
        },
        "details": []
    }
    
    def process_item(item: Dict[str, Any], item_path: str = ""):
        """Recursively process menu items and their table configs"""
        if not isinstance(item, dict):
            return
        
        current_path = f"{item_path}/{item.get('m_name', 'item')}" if item_path else item.get('m_name', 'root')
        
        # Process table configuration
        table_config = item.get("table")
        if table_config and isinstance(table_config, list):
            table_name = item.get("m_name", "unknown")
            
            for field in table_config:
                if not isinstance(field, dict):
                    continue
                
                f_type = field.get("f_types", "")
                # Only analyze combo fields
                if f_type not in ["co", "coro"]:
                    continue
                
                field_name = field.get("f_name", "unknown")
                stats["combo_fields"]["total"] += 1
                
                # Analyze the field
                analysis = analyze_combo_field(table_name, field_name, field)
                
                # Update stats
                status = analysis.get("status")
                stats["combo_fields"][status] = stats["combo_fields"].get(status, 0) + 1
                
                if status == "valid":
                    queries = analysis.get("queries", [])
                    if len(queries) == 1:
                        stats["query_patterns"]["simple_select"] += 1
                    elif len(queries) > 1:
                        stats["query_patterns"]["multi_query"] += 1
                    
                    if analysis.get("has_options"):
                        stats["query_patterns"]["with_options"] += 1
                    
                    for q in queries:
                        if q.get("has_where"):
                            stats["query_patterns"]["with_where"] += 1
                            break
                
                # Store details (limit to first 10 errors or samples)
                if len(stats["details"]) < 20:
                    analysis_copy = analysis.copy()
                    analysis_copy["path"] = current_path
                    analysis_copy["full_field_name"] = f"{table_name}.{field_name}"
                    stats["details"].append(analysis_copy)
        
        # Process nested items
        children = item.get("children", [])
        if isinstance(children, list):
            for child in children:
                process_item(child, current_path)
    
    # Process all menu items
    for item in menu_items:
        process_item(item)
    
    return filepath, stats

def main():
    """Main test execution"""
    print(colored("\n" + "="*80, Colors.BOLD))
    print(colored("Runtime Validation Test for f_cbo_query Conversions", Colors.HEADER))
    print(colored("="*80 + "\n", Colors.BOLD))
    
    files_to_test = [
        "backend/csm_datas/public/vemaybay/new_system_20260428/vemaybay_menu_full_newsystem_20260428.json",
        "backend/csm_datas/public/banhang/new_system_20260424/banhang_menu_full_newsystem_20260424.json",
    ]
    
    all_stats = []
    total_errors = 0
    
    for filepath in files_to_test:
        print(colored(f"\nValidating: {filepath}", Colors.BOLD))
        print("-" * 80)
        
        file_path, stats = validate_menu_file(filepath)
        all_stats.append(stats)
        
        if "error" in stats and "message" in stats:
            print(colored(f"✗ ERROR: {stats['message']}", Colors.FAIL))
            total_errors += 1
            continue
        
        # Print statistics
        combo_stats = stats.get("combo_fields", {})
        print(f"Total menu items: {stats.get('total_items', 0)}")
        print(f"Total combo fields: {combo_stats.get('total', 0)}")
        print(f"  ✓ Valid: {combo_stats.get('valid', 0)}")
        print(f"  ◯ Empty: {combo_stats.get('empty', 0)}")
        print(f"  ⚠ Dynamic code: {combo_stats.get('dynamic_code', 0)}")
        print(f"  ✗ Parse errors: {combo_stats.get('parse_error', 0)}")
        
        total_errors += combo_stats.get('parse_error', 0)
        
        # Query patterns
        patterns = stats.get("query_patterns", {})
        if patterns.get('total', 0) > 0:
            print(f"\nQuery patterns:")
            print(f"  Simple SELECT: {patterns.get('simple_select', 0)}")
            print(f"  Multi-query: {patterns.get('multi_query', 0)}")
            print(f"  With options: {patterns.get('with_options', 0)}")
            print(f"  With WHERE clause: {patterns.get('with_where', 0)}")
        
        # Show sample valid queries
        valid_samples = [d for d in stats.get("details", []) if d.get("status") == "valid"]
        if valid_samples and len(valid_samples) > 0:
            print(f"\n✓ Sample valid queries:")
            for sample in valid_samples[:3]:
                field_name = sample.get("full_field_name", "?")
                print(f"  - {field_name}: {sample.get('query_count', 0)} query(ies)")
        
        # Show any errors
        error_samples = [d for d in stats.get("details", []) if d.get("status") in ["parse_error", "dynamic_code"]]
        if error_samples:
            print(f"\n⚠ Special cases detected:")
            for sample in error_samples[:5]:
                status = sample.get("status")
                field_name = sample.get("full_field_name", "?")
                if status == "parse_error":
                    print(f"  ✗ {field_name}: {sample.get('message', '?')}")
                elif status == "dynamic_code":
                    print(f"  ⚠ {field_name}: Dynamic code (expected)")
    
    # Summary
    print("\n" + colored("="*80, Colors.BOLD))
    print(colored("SUMMARY", Colors.HEADER))
    print(colored("="*80, Colors.BOLD))
    
    for stats in all_stats:
        if "error" in stats:
            continue
        
        combo_stats = stats.get("combo_fields", {})
        filename = stats.get("filename", "?").split('/')[-1]
        
        total = combo_stats.get("total", 0)
        valid = combo_stats.get("valid", 0)
        errors = combo_stats.get("parse_error", 0)
        
        if errors == 0 and total > 0:
            status_msg = colored("✓ PASS", Colors.OK)
        elif errors > 0:
            status_msg = colored(f"✗ FAIL ({errors} errors)", Colors.FAIL)
        else:
            status_msg = "○ N/A"
        
        print(f"{filename}: {status_msg} ({valid}/{total} valid)")
    
    if total_errors == 0:
        print(colored("\n✓ All tests passed! All f_cbo_query conversions are valid.", Colors.OK))
        return 0
    else:
        print(colored(f"\n✗ {total_errors} parsing error(s) detected.", Colors.FAIL))
        return 1

if __name__ == "__main__":
    sys.exit(main())
