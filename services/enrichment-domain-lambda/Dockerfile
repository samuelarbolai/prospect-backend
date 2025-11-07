# Explicitly use the linux/amd64 platform to ensure the build targets the correct architecture 
# required by the default AWS Lambda environment.
FROM --platform=linux/amd64 public.ecr.aws/lambda/python:3.11

# Set the working directory to the Lambda task root
WORKDIR ${LAMBDA_TASK_ROOT}

# Copy project code and requirements
COPY . .

# Install dependencies
RUN pip install -r requirements.txt

# Set the CMD to your handler (e.g., file_name.handler_function)
CMD [ "handler.handler" ]