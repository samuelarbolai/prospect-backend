# --- Configuration Variables (Ready for use) ---
FUNCTION_NAME := domain-enrichment
PACKAGE_NAME  := deployment-package.zip
REGION        := us-east-1
AWS_PROFILE   := default

# --- Dependency Variables (Python) ---
REQUIREMENTS  := requirements.txt
DEPENDENCY_DIR:= . # Install dependencies into the current directory for zipping

# --- Dynamic Exclusion List (Reads from .gitignore) ---
EXCLUDE_PATTERNS := $(shell grep -v -e '^#' -e '^$$' .gitignore | tr '\n' ' ')

# --- Core Targets ---
.PHONY: install package deploy clean

install:
	@echo "--- 1. 🐍 Installing Python Dependencies..."
	# Installs packages from requirements.txt into the current directory.
	pip install -r $(REQUIREMENTS) -t $(DEPENDENCY_DIR)

package: install
	@echo "--- 2. 📦 Creating deployment package: $(PACKAGE_NAME)..."
	# Zips all files, excluding the package itself and all .gitignore items.
	zip -r -f $(PACKAGE_NAME) . -x "$(PACKAGE_NAME)" $(EXCLUDE_PATTERNS)

deploy: package
	@echo "--- 3. 🚀 Deploying to Lambda function: $(FUNCTION_NAME)..."
	aws lambda update-function-code \
		--function-name $(FUNCTION_NAME) \
		--zip-file fileb://$(PACKAGE_NAME) \
		--region $(REGION) \
		--profile $(AWS_PROFILE)

clean:
	@echo "--- 4. 🧹 Cleaning up generated ZIP file..."
	rm -f $(PACKAGE_NAME)