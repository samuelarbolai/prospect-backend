# build.sh
#!/bin/bash

set -e

echo "🔨 Building Lambda package with Docker..."

# Build the Docker image
docker build --platform linux/amd64 -t lambda-deps-builder .

# Create a container from the image
docker create --name temp-container lambda-deps-builder

# Extract the dependencies
echo "📦 Extracting dependencies..."
rm -rf package
mkdir -p package
docker cp temp-container:/asset/. package/

# Clean up the container
docker rm temp-container

# Copy your application code
echo "📝 Copying application code..."
cp processor.py package/
cp handler.py package/
cp utils.py package/
cp linkedin_enrichment.py package/
cp prompt.txt package/

# Create the deployment package
echo "🗜️  Creating zip file..."
cd package
zip -r ../lambda-package.zip . -x "*.pyc" "*.pyo" "__pycache__/*" "*.dist-info/*"
cd ..

# Show package size
echo "✅ Package created successfully!"
ls -lh lambda-package.zip

echo ""
echo "📊 Package contents preview:"
unzip -l lambda-package.zip | head -20

echo ""
echo "🚀 Ready to deploy! Upload lambda-package.zip to AWS Lambda"