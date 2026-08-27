# ores-otel-sidecar-contract-tests

Black-box HTTP contract tests for ores-otel-sidecar.

External / end-user tests. They do not import product crates.

```sh
python -m unittest discover -s tests -v
SIDECAR_URL=http://127.0.0.1:9090 python -m unittest discover -s tests -v
```
