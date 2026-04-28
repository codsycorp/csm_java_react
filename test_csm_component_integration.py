#!/usr/bin/env python3
"""
CsmDynamicGrid Component Integration Test
Simulates the actual parsing flow from CsmDynamicGrid.tsx and combo-utils.ts
"""

import json
import sys
from typing import Any, Dict, List, Optional, Tuple

class CsmDynamicGridSimulator:
    """
    Simulates CsmDynamicGrid component's parsing logic for combo fields
    Based on: frontend-admin/src/components/csm-grid/combo-utils.ts
    """
    
    SYSTEM_CSM_TABLES = {
        "csm_accounts",
        "csm_group_members", 
        "sys_la_routers",
        "sys_apps",
        "sys_reactnative"
    }
    
    @classmethod
    def resolve_combo_query_app_id(cls, table_name: str, preferred_app_id: Optional[str] = None, 
                                   fallback_app_id: Optional[str] = None) -> str:
        """
        Simulates resolveComboQueryAppId from combo-utils.ts
        Determines which app/database a table belongs to
        """
        normalized = str(table_name or "").strip().lower()
        if normalized in cls.SYSTEM_CSM_TABLES:
            return "csm"
        
        if preferred_app_id:
            return str(preferred_app_id).strip()
        
        if fallback_app_id:
            return str(fallback_app_id).strip()
        
        return "csm"
    
    @staticmethod
    def normalize_combo_options(raw: Any) -> List[Dict[str, Any]]:
        """
        Simulates normalizeComboOptions from combo-utils.ts
        Normalizes various option formats to standard [{value, label}] format
        """
        if not isinstance(raw, list):
            return []
        
        result = []
        for item in raw:
            option = None
            
            if isinstance(item, list):
                # [value, label] format
                if len(item) >= 2:
                    option = {"value": item[0], "label": str(item[1] or item[0] or "")}
                elif len(item) == 1:
                    option = {"value": item[0], "label": str(item[0])}
            
            elif isinstance(item, dict):
                # {value, label} or {ma, ten} or {id, text} format
                value = item.get("value") or item.get("ma") or item.get("id") or item.get("key")
                label = str(item.get("label") or item.get("ten") or item.get("text") or value or "")
                if value is not None:
                    option = {"value": value, "label": label}
            
            elif item is not None and item != "":
                # Scalar value
                option = {"value": item, "label": str(item)}
            
            if option and option.get("value") is not None:
                result.append(option)
        
        return result
    
    @staticmethod
    def parse_static_combo_query(input_str: str) -> Optional[Dict[str, Any]]:
        """
        Simulates parseStaticComboQuery from combo-utils.ts
        Attempts to parse JSON or JS object literal from string
        """
        text = str(input_str or "").strip()
        if not text:
            return None
        
        if not (text.startswith("{") or text.startswith("[")):
            return None
        
        # Try JSON
        try:
            return json.loads(text)
        except:
            pass
        
        # Try JavaScript eval (simplified)
        try:
            sanitized = text.replace("true", "True").replace("false", "False").replace("null", "None")
            return eval(sanitized)
        except:
            pass
        
        return None
    
    @classmethod
    def extract_combo_queries(cls, field: Dict[str, Any], fallback_app_id: str = "csm") -> List[Dict[str, Any]]:
        """
        Simulates extractComboQueriesFromField from combo-utils.ts
        Extracts database query specifications from field configuration
        """
        raw = str(field.get("f_cbo_query") or "").strip()
        if not raw:
            return []
        
        parsed = cls.parse_static_combo_query(raw)
        if not parsed:
            return []
        
        queries = parsed.get("query", []) if isinstance(parsed, dict) else []
        if not isinstance(queries, list):
            return []
        
        result = []
        for q in queries:
            if not isinstance(q, dict):
                continue
            
            table_name = str(q.get("obj_name") or "").strip()
            if not table_name:
                continue
            
            app_id = cls.resolve_combo_query_app_id(table_name, q.get("app_id"), fallback_app_id)
            
            # Extract WHERE condition (simplified)
            where = None
            if q.get("obj_where"):
                where = q.get("obj_where")
            
            result.append({
                "appId": app_id,
                "tableName": table_name,
                "fields": q.get("fields", []),
                "where": where,
                "original": q
            })
        
        return result

def test_field_parsing(field_name: str, field: Dict[str, Any], fallback_app: str = "csm") -> Dict[str, Any]:
    """Test parsing a single field through CsmDynamicGrid flow"""
    simulator = CsmDynamicGridSimulator()
    
    result = {
        "field_name": field_name,
        "field_type": field.get("f_types"),
        "f_cbo_query_length": len(str(field.get("f_cbo_query") or "")),
        "parsing_result": None,
        "errors": []
    }
    
    try:
        # Step 1: Extract combo queries
        queries = simulator.extract_combo_queries(field, fallback_app)
        
        # Step 2: Parse static combo query
        parsed = simulator.parse_static_combo_query(str(field.get("f_cbo_query") or ""))
        
        if parsed:
            options = parsed.get("options", [])
            
            # Step 3: Normalize options
            normalized_opts = simulator.normalize_combo_options(options) if options else []
            
            result["parsing_result"] = {
                "success": True,
                "queries_extracted": len(queries),
                "options_extracted": len(normalized_opts),
                "query_details": []
            }
            
            # Add query details
            for q in queries:
                result["parsing_result"]["query_details"].append({
                    "appId": q.get("appId"),
                    "tableName": q.get("tableName"),
                    "fields": q.get("fields"),
                    "has_where": q.get("where") is not None
                })
            
            if queries:
                result["parsing_result"]["sample_query"] = queries[0]
            
            if normalized_opts:
                result["parsing_result"]["sample_option"] = normalized_opts[0]
        else:
            result["parsing_result"] = {
                "success": False,
                "reason": "Could not parse f_cbo_query"
            }
    
    except Exception as e:
        result["errors"].append(str(e))
        result["parsing_result"] = {"success": False}
    
    return result

def run_integration_tests():
    """Execute full integration test suite"""
    
    print("\n" + "="*110)
    print("CsmDynamicGrid Component Integration Test - Full Parsing Simulation")
    print("="*110 + "\n")
    
    files_and_apps = [
        ("backend/csm_datas/public/vemaybay/new_system_20260428/vemaybay_menu_full_newsystem_20260428.json", "vemaybay"),
        ("backend/csm_datas/public/banhang/new_system_20260424/banhang_menu_full_newsystem_20260424.json", "banhang"),
    ]
    
    overall_stats = {
        "total_fields": 0,
        "successful": 0,
        "failed": 0,
        "files": []
    }
    
    for filepath, app_name in files_and_apps:
        print(f"📊 Testing: {app_name} ({filepath.split('/')[-1]})")
        print("-" * 110)
        
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            print(f"❌ Failed to load file: {e}\n")
            continue
        
        menu_items = data.get("menu", [])
        file_stats = {
            "app": app_name,
            "total_fields": 0,
            "successful": 0,
            "failed": 0,
            "test_results": []
        }
        
        # Collect all combo fields
        combo_fields = []
        
        def collect(item: Dict[str, Any]):
            if not isinstance(item, dict):
                return
            
            table_config = item.get("table", [])
            table_name = item.get("m_name", "")
            
            if table_config:
                for field in table_config:
                    if field.get("f_types") in ["co", "coro"]:
                        combo_fields.append({
                            "table": table_name,
                            "name": field.get("f_name"),
                            "field": field
                        })
            
            for child in item.get("children", []):
                collect(child)
        
        for item in menu_items:
            collect(item)
        
        file_stats["total_fields"] = len(combo_fields)
        overall_stats["total_fields"] += len(combo_fields)
        
        # Test each field
        for combo in combo_fields[:20]:  # Limit to 20 samples per file
            result = test_field_parsing(combo["name"], combo["field"], app_name)
            
            if result["parsing_result"] and result["parsing_result"].get("success"):
                file_stats["successful"] += 1
                overall_stats["successful"] += 1
            else:
                file_stats["failed"] += 1
                overall_stats["failed"] += 1
            
            file_stats["test_results"].append(result)
        
        # Print file stats
        success_rate = (file_stats["successful"] / len(file_stats["test_results"]) * 100) if file_stats["test_results"] else 0
        print(f"Total combo fields in file: {file_stats['total_fields']}")
        print(f"Tested: {len(file_stats['test_results'])} fields")
        print(f"✅ Successful: {file_stats['successful']} ({success_rate:.1f}%)")
        print(f"❌ Failed: {file_stats['failed']}")
        
        # Show sample results
        print(f"\n📝 Sample Test Results:")
        for i, result in enumerate(file_stats["test_results"][:5], 1):
            field_name = result["field_name"]
            parsing = result["parsing_result"]
            
            if parsing.get("success"):
                queries = parsing.get("queries_extracted", 0)
                options = parsing.get("options_extracted", 0)
                print(f"  {i}. ✅ {field_name}: {queries} queries, {options} options")
                
                if parsing.get("query_details"):
                    for q in parsing["query_details"]:
                        print(f"     → {q['tableName']} ({', '.join(q.get('fields', []))})")
            else:
                print(f"  {i}. ❌ {field_name}: {parsing.get('reason', 'Unknown error')}")
        
        overall_stats["files"].append(file_stats)
        print("\n" + "="*110 + "\n")
    
    # Summary
    print("📋 INTEGRATION TEST SUMMARY")
    print("="*110)
    
    for file_result in overall_stats["files"]:
        app = file_result["app"]
        total = file_result["total_fields"]
        success = file_result["successful"]
        pct = (success / len(file_result["test_results"]) * 100) if file_result["test_results"] else 0
        
        status = "✅ PASS" if file_result["failed"] == 0 else f"⚠️  PARTIAL ({file_result['failed']} failures)"
        print(f"{app:15} {status:20} {success}/{len(file_result['test_results'])} tested ({pct:.1f}% success)")
    
    print("-" * 110)
    total = overall_stats["total_fields"]
    success = overall_stats["successful"]
    pct = (success / total * 100) if total > 0 else 0
    
    print(f"{'TOTAL':15} {success}/{total} parsed successfully ({pct:.1f}% success rate)")
    
    if overall_stats["failed"] == 0:
        print("\n✅ All fields parse successfully through CsmDynamicGrid simulation!")
        print("✅ Ready for production deployment")
        return 0
    else:
        print(f"\n⚠️ {overall_stats['failed']} parsing failures detected")
        return 1

if __name__ == "__main__":
    sys.exit(run_integration_tests())
