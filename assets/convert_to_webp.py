#!/usr/bin/env python3
"""
WebP Conversion Script for Portfolio Assets
Converts PNG and JPG images to WebP format for better compression.

Usage:
    python convert_to_webp.py [--quality 85] [--dry-run]

Requirements:
    pip install Pillow

This script will:
1. Convert all PNG/JPG files in assets/ to WebP
2. Keep originals as backup (renamed with .backup extension)
3. Optionally update HTML/JS references to use .webp extensions
"""

import os
import sys
import argparse
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow is required. Install with: pip install Pillow")
    sys.exit(1)


# Files to convert (relative to assets/)
TARGET_FILES = [
    'Cory_Coffee.jpg',
    'CorySuitTopDown.jpg',
    'Cory_Iceland.JPG',
    'Cory_Victoria.jpg',
    'Cory_PoliceBox.jpg'
]

# Files that reference these images (for optional auto-update)
SOURCE_FILES = []


def get_webp_path(original_path: Path) -> Path:
    """Get the WebP output path for an image."""
    return original_path.with_suffix('.webp')


def convert_image(input_path: Path, output_path: Path, quality: int = 85) -> dict:
    """
    Convert an image to WebP format.

    Returns dict with conversion stats.
    """
    with Image.open(input_path) as img:
        # Handle transparency for PNGs
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            # Keep alpha channel
            img = img.convert('RGBA')
        else:
            img = img.convert('RGB')

        # Save as WebP
        img.save(output_path, 'WEBP', quality=quality, method=6)

    original_size = input_path.stat().st_size
    webp_size = output_path.stat().st_size
    savings = ((original_size - webp_size) / original_size) * 100

    return {
        'original_size': original_size,
        'webp_size': webp_size,
        'savings_percent': savings
    }


def update_references(project_root: Path, old_name: str, new_name: str, dry_run: bool = False):
    """Update file references from old filename to new filename."""
    changes = []

    for source_file in SOURCE_FILES:
        file_path = project_root / source_file
        if not file_path.exists():
            continue

        content = file_path.read_text(encoding='utf-8')
        if old_name in content:
            if not dry_run:
                new_content = content.replace(old_name, new_name)
                file_path.write_text(new_content, encoding='utf-8')
            changes.append((source_file, content.count(old_name)))

    return changes


def main():
    parser = argparse.ArgumentParser(description='Convert images to WebP format')
    parser.add_argument('--quality', type=int, default=85,
                        help='WebP quality (0-100, default: 85)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would be done without making changes')
    parser.add_argument('--update-refs', action='store_true',
                        help='Also update HTML/JS references to use .webp')
    parser.add_argument('--keep-originals', action='store_true', default=True,
                        help='Keep original files (default: True)')
    args = parser.parse_args()

    # Script is in the assets folder
    assets_dir = Path(__file__).parent.resolve()

    if not assets_dir.exists():
        print(f"Error: assets/ directory not found at {assets_dir}")
        sys.exit(1)

    print(f"WebP Conversion Script")
    print(f"=" * 50)
    print(f"Quality: {args.quality}")
    print(f"Dry run: {args.dry_run}")
    print(f"Update references: {args.update_refs}")
    print()

    total_original = 0
    total_webp = 0
    converted = []

    for filename in TARGET_FILES:
        input_path = assets_dir / filename

        if not input_path.exists():
            print(f"⚠️  Skipping {filename} (not found)")
            continue

        output_path = get_webp_path(input_path)

        if args.dry_run:
            print(f"📋 Would convert: {filename} → {output_path.name}")
            continue

        try:
            stats = convert_image(input_path, output_path, args.quality)
            total_original += stats['original_size']
            total_webp += stats['webp_size']

            print(f"✅ {filename}")
            print(f"   Original: {stats['original_size']:,} bytes")
            print(f"   WebP:     {stats['webp_size']:,} bytes")
            print(f"   Savings:  {stats['savings_percent']:.1f}%")
            print()

            converted.append((filename, output_path.name))

        except Exception as e:
            print(f"❌ Error converting {filename}: {e}")

    if not args.dry_run and converted:
        print(f"=" * 50)
        print(f"Total savings: {((total_original - total_webp) / total_original) * 100:.1f}%")
        print(f"Original total: {total_original:,} bytes ({total_original / 1024:.1f} KB)")
        print(f"WebP total:     {total_webp:,} bytes ({total_webp / 1024:.1f} KB)")
        print()

        if args.update_refs:
            print("Updating file references...")
            for old_name, new_name in converted:
                changes = update_references(script_dir, old_name, new_name, args.dry_run)
                for file, count in changes:
                    print(f"   Updated {count} reference(s) in {file}")
            print()
        else:
            print("💡 To update HTML/JS references, run with --update-refs")
            print("   Or manually update these files:")
            for old_name, new_name in converted:
                print(f"   - Change '{old_name}' to '{new_name}'")

    print("\nDone!")


if __name__ == '__main__':
    main()
