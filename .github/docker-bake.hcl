variable "CACHE_FROM_GHA" {
  default = "false"
}

variable "CACHE_TO_GHA" {
  default = "false"
}

group "default" {
  targets = ["images"]
}

target "images" {
  name = image.name
  matrix = {
    image = [
      { name = "backend", context = "backend" },
      { name = "frontend", context = "frontend" },
      { name = "backup", context = "deploy/backup" },
      { name = "postgres", context = "deploy/postgres" },
      { name = "mcp", context = "mcp" },
    ]
  }
  context    = image.context
  tags       = ["ghcr.io/bzumik1/nfnn-${image.name}:latest"]
  cache-from = CACHE_FROM_GHA == "true" ? ["type=gha,scope=nfnn-${image.name}"] : []
  cache-to   = CACHE_TO_GHA == "true" ? ["type=gha,scope=nfnn-${image.name},mode=max"] : []
}
