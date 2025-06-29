#!/usr/bin/env python3
"""
Test script for Claude Code SDK tools to capture output schemas.
This script tests various edit tools and saves their response schemas to JSON files.
"""

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path
import tempfile
import uuid

class SDKToolTester:
    def __init__(self):
        self.schemas_dir = Path("schemas")
        self.schemas_dir.mkdir(exist_ok=True)
        self.test_files_dir = Path("test_files")
        self.test_files_dir.mkdir(exist_ok=True)
        
    def run_claude_command(self, prompt, additional_args=None):
        """Run Claude CLI command and capture JSON output."""
        cmd = [
            "claude", "-p", prompt,
            "--output-format", "stream-json",
            "--verbose"
        ]
        if additional_args:
            cmd.extend(additional_args)
            
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                cwd=os.getcwd()
            )
            
            # Parse stream-json output
            messages = []
            for line in result.stdout.strip().split('\n'):
                if line.strip():
                    try:
                        messages.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
                        
            return {
                "success": result.returncode == 0,
                "messages": messages,
                "stderr": result.stderr
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "messages": []
            }
    
    def save_schema(self, tool_name, schema_data):
        """Save schema data to JSON file."""
        filename = f"{tool_name}_schema.json"
        filepath = self.schemas_dir / filename
        
        with open(filepath, 'w') as f:
            json.dump(schema_data, f, indent=2)
        
        print(f"Saved {tool_name} schema to {filepath}")
    
    def test_edit_tool(self):
        """Test the Edit tool by modifying a file."""
        print("Testing Edit tool...")
        
        # Create a test file first
        test_file = self.test_files_dir / "edit_test.py"
        test_file.write_text("def hello():\n    print('Hello, World!')")
        
        prompt = f"""Edit the file {test_file} to add a docstring to the hello function. Use the Edit tool to make this change."""
        
        result = self.run_claude_command(prompt)
        
        schema_data = {
            "tool_name": "Edit",
            "test_scenario": "Add docstring to function",
            "success": result["success"],
            "messages": result["messages"],
            "stderr": result.get("stderr", "")
        }
        
        self.save_schema("edit_tool", schema_data)
        return result["success"]
    
    def test_write_tool(self):
        """Test the Write tool by creating a new file."""
        print("Testing Write tool...")
        
        new_file = self.test_files_dir / f"write_test_{uuid.uuid4().hex[:8]}.js"
        
        prompt = f"""Create a new JavaScript file at {new_file} with a simple React component. Use the Write tool to create this file."""
        
        result = self.run_claude_command(prompt)
        
        schema_data = {
            "tool_name": "Write",
            "test_scenario": "Create new JavaScript React component file",
            "success": result["success"],
            "messages": result["messages"],
            "stderr": result.get("stderr", "")
        }
        
        self.save_schema("write_tool", schema_data)
        return result["success"]
    
    def test_multiedit_tool(self):
        """Test the MultiEdit tool by making multiple changes to a file."""
        print("Testing MultiEdit tool...")
        
        # Create a test file with multiple functions
        test_file = self.test_files_dir / "multiedit_test.py"
        test_file.write_text("""def add(a, b):
    return a + b

def subtract(a, b):
    return a - b

def multiply(a, b):
    return a * b
""")
        
        prompt = f"""Use the MultiEdit tool to add docstrings to all three functions in {test_file}. Make multiple edits in a single operation."""
        
        result = self.run_claude_command(prompt)
        
        schema_data = {
            "tool_name": "MultiEdit",
            "test_scenario": "Add docstrings to multiple functions",
            "success": result["success"],
            "messages": result["messages"],
            "stderr": result.get("stderr", "")
        }
        
        self.save_schema("multiedit_tool", schema_data)
        return result["success"]
    
    def test_notebook_edit_tool(self):
        """Test the NotebookEdit tool by modifying a Jupyter notebook."""
        print("Testing NotebookEdit tool...")
        
        # Create a simple test notebook
        notebook_content = {
            "cells": [
                {
                    "cell_type": "code",
                    "execution_count": None,
                    "metadata": {},
                    "outputs": [],
                    "source": ["print('Hello from notebook')"]
                }
            ],
            "metadata": {
                "kernelspec": {
                    "display_name": "Python 3",
                    "language": "python",
                    "name": "python3"
                }
            },
            "nbformat": 4,
            "nbformat_minor": 4
        }
        
        notebook_file = self.test_files_dir / "notebook_test.ipynb"
        with open(notebook_file, 'w') as f:
            json.dump(notebook_content, f)
        
        prompt = f"""Use the NotebookEdit tool to add a new markdown cell to the notebook {notebook_file} with a title "# Test Notebook"."""
        
        result = self.run_claude_command(prompt)
        
        schema_data = {
            "tool_name": "NotebookEdit",
            "test_scenario": "Add markdown cell to notebook",
            "success": result["success"],
            "messages": result["messages"],
            "stderr": result.get("stderr", "")
        }
        
        self.save_schema("notebook_edit_tool", schema_data)
        return result["success"]
    
    def run_all_tests(self):
        """Run all tool tests."""
        print("Starting Claude Code SDK tool testing...")
        print(f"Working directory: {os.getcwd()}")
        print(f"Schemas will be saved to: {self.schemas_dir.absolute()}")
        
        results = {}
        
        # Test each tool
        results["edit"] = self.test_edit_tool()
        results["write"] = self.test_write_tool()
        results["multiedit"] = self.test_multiedit_tool()
        results["notebook_edit"] = self.test_notebook_edit_tool()
        
        # Summary
        print("\n" + "="*50)
        print("Test Results Summary:")
        for tool, success in results.items():
            status = "✓ PASSED" if success else "✗ FAILED"
            print(f"  {tool}: {status}")
        
        print(f"\nSchema files saved to: {self.schemas_dir.absolute()}")
        return results

def main():
    """Main entry point."""
    if len(sys.argv) > 1 and sys.argv[1] == "--help":
        print(__doc__)
        return
    
    tester = SDKToolTester()
    results = tester.run_all_tests()
    
    # Exit with error code if any tests failed
    if not all(results.values()):
        sys.exit(1)

if __name__ == "__main__":
    main()