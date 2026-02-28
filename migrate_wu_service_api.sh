#!/bin/bash

# ============================================================================
# SEO URL Migration Script: Remove .shtml from wu_service.ts API
# ============================================================================
# Purpose: Remove .shtml stripping logic from API service files
# Files: frontend/src/api/wu_service.ts
#        lmkt/src/api/wu_service.ts
#
# Usage: bash migrate_wu_service_api.sh
# ============================================================================

set -e

PROJECT_ROOT="/Volumes/Datas/CSM/JavaProjects/csm_server"
FRONTEND_FILE="$PROJECT_ROOT/frontend/src/api/wu_service.ts"
LMKT_FILE="$PROJECT_ROOT/lmkt/src/api/wu_service.ts"

echo "🚀 Starting wu_service.ts API migration..."
echo

# Function to migrate file
migrate_file() {
    local file=$1
    local name=$2
    
    if [ ! -f "$file" ]; then
        echo "❌ File not found: $file"
        return 1
    fi
    
    echo "📝 Processing: $name"
    echo "   File: $file"
    
    # Backup original
    cp "$file" "$file.backup"
    echo "   ✅ Backup created: $file.backup"
    
    # Replace .shtml stripping logic
    # This removes the .replace(/\.shtml$/, '') calls
    # Need to be careful to preserve the context
    
    # Pattern: String(id).replace(/\.shtml$/, '')  →  String(id)
    sed -i '' "s|String(id)\.replace(/\\\.shtml\$\/, '')||g" "$file"
    sed -i '' "s|String(id)\.replace(/\\.shtml\\\$\\/, '')|String(id)|g" "$file"
    
    # Pattern: String(t).replace(/\.shtml$/, '')  →  String(t)
    sed -i '' "s|String(t)\.replace(/\\.shtml\\\$\\/, '')|String(t)|g" "$file"
    
    # Pattern: idStr.replace(/\.shtml$/, '')  →  idStr
    sed -i '' "s|idStr\.replace(/\\.shtml\\\$\\/, '')|idStr|g" "$file"
    
    # Pattern: id.replace(/\.shtml$/, '')  →  id
    sed -i '' "s|\.replace(/\\.shtml\\\$\\/, '')||g" "$file"
    
    echo "   ✅ All .replace patterns removed"
    
    # Show summary
    local diff_count=$(diff "$file.backup" "$file" 2>/dev/null | wc -l || echo 0)
    echo "   📊 Changes: ~$((diff_count / 2)) lines modified"
    echo
}

# Migrate both files
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
migrate_file "$FRONTEND_FILE" "Frontend wu_service.ts" || exit 1

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
migrate_file "$LMKT_FILE" "LMKT wu_service.ts" || exit 1

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "✅ API migration complete!"
echo
echo "📋 Summary:"
echo "   • Frontend: $FRONTEND_FILE"
echo "   • LMKT: $LMKT_FILE"
echo "   • Backups: *.backup files created"
echo
echo "🔍 Verification:"
echo "   1. Review changes: diff $FRONTEND_FILE.backup $FRONTEND_FILE"
echo "   2. Search for '.shtml' in file to ensure all removed"
echo "   3. Test API calls with clean URLs"
echo
echo "💾 Cleanup (after verification):"
echo "   rm $FRONTEND_FILE.backup $LMKT_FILE.backup"
echo
