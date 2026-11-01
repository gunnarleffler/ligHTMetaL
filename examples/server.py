"""Dev server for lightmetal.

Serves the library showcase at /, project demos and skin galleries,
and bundles at /dist/.

Run from the repo root: uv run python examples/server.py
Open http://localhost:5000/.
The smoke test runs it with LM_TEST_PORT set to a spare port.
"""

import os

from flask import Flask, send_from_directory

EXAMPLES = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(EXAMPLES)
DIST = os.path.join(ROOT, "dist")
PORT = int(os.environ.get("LM_TEST_PORT", "5000"))

app = Flask(__name__, static_folder=DIST, static_url_path="/")


@app.route("/dist/<path:path>")
def dist(path):
  # The demo references ../dist/ relative to /, which maps onto dist/.
  return send_from_directory(DIST, path)


@app.route("/")
@app.route("/index.html")
def index():
  return send_from_directory(EXAMPLES, "index.html")


@app.route("/html.html")
def html_demo():
  return send_from_directory(EXAMPLES, "html.html")


@app.route("/meltdown.html")
def meltdown_demo():
  return send_from_directory(EXAMPLES, "meltdown.html")


@app.route("/polish.html")
def polish_demo():
  return send_from_directory(EXAMPLES, "polish.html")


@app.route("/markdown-skins.html")
def markdown_skins():
  return send_from_directory(EXAMPLES, "markdown-skins.html")


@app.route("/skins.html")
def skins():
  return send_from_directory(EXAMPLES, "skins.html")


@app.route("/markdown.html")
def markdown_demo():
  return send_from_directory(EXAMPLES, "markdown.html")


@app.route("/markdown-iframe.html")
def markdown_iframe_demo():
  return send_from_directory(EXAMPLES, "markdown-iframe.html")


@app.route("/examples/<path:path>")
def examples(path):
  return send_from_directory(EXAMPLES, path)


@app.route("/README.md")
def readme():
  return send_from_directory(ROOT, "README.md")


@app.route("/ligHTMetaL.png")
def logo():
  # Served from the repo root for the demo at /; the same relative path
  # resolves to the file too, so the demo works over file:// as well.
  return send_from_directory(ROOT, "ligHTMetaL.png")


@app.route("/img/tiny.png")
def tiny_png():
  # Used by the smoke test's paste/drop checks.
  return send_from_directory(EXAMPLES, "images/tiny.png")


if __name__ == "__main__":
  # Reloader stays on for interactive dev, off when a test drives the server.
  app.run(host="0.0.0.0", port=PORT, use_reloader=PORT == 5000)
