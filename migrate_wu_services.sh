#!/bin/bash

# ============================================================================
# SEO URL Migration Script: Remove .shtml from wu_services.tsx
# ============================================================================
# Purpose: Automatically remove .shtml extensions from URL generation
# Files: frontend/src/pages/website/wu_services.tsx
#        lmkt/src/pages/website/wu_services.tsx
#
# Usage: bash migrate_wu_services.sh
# ============================================================================

set -e  # Exit on error

PROJECT_ROOT="/Volumes/Datas/CSM/JavaProjects/csm_server"
FRONTEND_FILE="$PROJECT_ROOT/frontend/src/pages/website/wu_services.tsx"
LMKT_FILE="$PROJECT_ROOT/lmkt/src/pages/website/wu_services.tsx"

echo "🚀 Starting wu_services.tsx migration..."
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
    
    # Replace patterns
    # Pattern 1: Category/Key URL generation
    sed -i '' "s|\`/\${categoryKey}\.shtml\`|\`/\${categoryKey}\`|g" "$file"
    
    # Pattern 2: Default service redirect
    sed -i '' "s|\`/\${defaultServiceSlug}\.shtml\`|\`/\${defaultServiceSlug}\`|g" "$file"
    
    # Pattern 3: Tab URL
    sed -i '' "s|\`/\${key}\.shtml\`|\`/\${key}\`|g" "$file"
    
    # Pattern 4: Service detail URL
    sed -i '' "s|\`/\${post\.serviceType}/\${post\.slug}\.shtml\`|\`/\${post\.serviceType}/\${post\.slug}\`|g" "$file"
    
    # Pattern 5: Category key in menu
    sed -i '' "s|\`/\${activeTabKey}\.shtml\`|\`/\${activeTabKey}\`|g" "$file"
    sed -i '' "s|\`/\${DEFAULT_CATEGORY}\.shtml\`|\`/\${DEFAULT_CATEGORY}\`|g" "$file"
    
    # Pattern 6: Origin URLs  
    sed -i '' "s|origin}/\${DEFAULT_CATEGORY}\.shtml|origin}/\${DEFAULT_CATEGORY}|g" "$file"
    sed -i '' "s|origin}/\${activeCategory\.key}\.shtml|origin}/\${activeCategory\.key}|g" "$file"
    
    # Pattern 7: Category path fallback
    sed -i '' "s|\`/\${category\.key}\.shtml\`|\`/\${category\.key}\`|g" "$file"
    
    # Pattern 8: Generic .shtml removal (with caution)
    sed -i '' "s|\.shtml\`|"\`"|g" "$file"
    
    # Pattern 9: Comments mentioning .shtml redirects
    sed -i '' "s|/du-an\.shtml|/du-an|g" "$file"
    
    echo "   ✅ All patterns replaced"
    
    # Show summary
    local diff_count=$(diff "$file.backup" "$file" 2>/dev/null | wc -l || echo 0)
    echo "   📊 Changes: ~$((diff_count / 2)) lines modified"
    echo
}

# Migrate both files
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
migrate_file "$FRONTEND_FILE" "Frontend wu_services.tsx" || exit 1

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
migrate_file "$LMKT_FILE" "LMKT wu_services.tsx" || exit 1

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "✅ Migration complete!"
echo
echo "📋 Summary:"
echo "   • Frontend: $FRONTEND_FILE"
echo "   • LMKT: $LMKT_FILE"
echo "   • Backups: *.backup files created"
echo
echo "🔍 Verification:"
echo "   1. Review changes: diff $FRONTEND_FILE.backup $FRONTEND_FILE"
echo "   2. Test compilation: npm run build"
echo "   3. Verify routes work with clean URLs"
echo
echo "💾 Cleanup (after verification):"
echo "   rm $FRONTEND_FILE.backup $LMKT_FILE.backup"
echo
