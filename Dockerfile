# Use an official Ruby image based on Debian (e.g., Bullseye)
FROM ruby:3.1.1-bullseye

# Install additional dependencies as needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    libffi-dev \
    libgmp-dev \
    libssl-dev \
    libxml2-dev \
    libxslt1-dev \
    zlib1g-dev \
    nodejs \
 && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /srv/jekyll

# Copy the Gemfile and Gemfile.lock and install the gems
COPY Gemfile Gemfile.lock ./
RUN bundle lock --add-platform aarch64-linux
RUN bundle install

# Declare the mount point (the project’s root inside the container)
VOLUME ["/srv/jekyll"]

# Optionally expose the port Jekyll will use (default is 4000)
EXPOSE 4000

# Set the default command to run Jekyll
CMD ["bundle", "exec", "jekyll", "serve", "--host", "0.0.0.0"]