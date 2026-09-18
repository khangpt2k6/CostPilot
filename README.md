<div align="center">

<img src="docs/Avatar_Costpilot.png" width="170" alt="CostPilot mascot: a small robot in a pilot cap holding a magnifying glass over a spending chart">

# CostPilot

*Nobody knew who was spending the money.*<br>
*The bill only showed up at the end of the month, and by then it was gone.*

**An AI spending gateway that says no before the money is gone.**

<p>
<img height="56" alt="Java 21" src="https://cdn.simpleicons.org/openjdk/5382A1">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
<img height="56" alt="Spring Boot" src="https://cdn.simpleicons.org/springboot/6DB33F">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
<img height="56" alt="Postgres + pgvector" src="https://cdn.simpleicons.org/postgresql/5D8FD6">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
<img height="56" alt="Redis" src="https://cdn.simpleicons.org/redis/FF5449">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
<img height="56" alt="Kafka" src="https://cdn.simpleicons.org/apachekafka/8F98A6">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
<img height="56" alt="ClickHouse" src="https://cdn.simpleicons.org/clickhouse/EFB100">
</p>

<a href="docs/README.md"><b>Setup and usage docs</b></a> · <a href="docs/BENCHMARK.md"><b>Benchmarks</b></a>

</div>

---

## Architecture

Ten steps. Everything the request touches lights up as it goes.

<p align="center">
  <img src="docs/diagram.gif" alt="A live request moving through the CostPilot pipeline: auth, normalize, policy, cache, route, budget, forward, meter, ledger, settle" width="100%">
</p>

| # | step | decides |
|:---:|---|---|
| 1 | **Auth** | who you are, from a hashed key, never from a header you sent |
| 2 | **Normalize** | your OpenAI shaped request becomes one internal shape |
| 3 | **Policy** | allow, deny, quietly downgrade, or hold for a human |
| 4 | **Cache** | close enough to something already answered, serve it for free |
| 5 | **Route** | cheapest model that still clears the bar you asked for |
| 6 | **Budget** | reserve the worst case cost across every scope that governs you |
| 7 | **Forward** | out to OpenAI, Anthropic, Gemini, or the built in mock |
| 8 | **Meter** | count the money as it streams, cut off cleanly on breach |
| 9 | **Ledger** | write the real charge, once, even if you hang up |
| 10 | **Settle** | release, publish, and leave an audit row explaining the verdict |

## Quickstart

Docker is the only thing you need, and the demo costs nothing because the default upstream is a mock provider that lives inside the app.

```bash
git clone https://github.com/tanhoangkhoanguyen/CostPilot.git
cd CostPilot
docker compose up --build -d
```

Then walk through the ten minute demo, the CLI, the Python SDK, and going live with real providers here:

### → [Setup and usage docs](docs/README.md)

## Repo layout

```
build.gradle  settings.gradle  gradlew  gradle/   build entry point (must be root)
docker-compose.yml  docker-compose.real.yml       demo stack (must be root)
docker/                                           Dockerfile + service configs
src/                                              gateway source (Java only)
cli/                                              admin CLI, its own Gradle subproject
sdk/python/                                       Python client, not a Gradle module
docs/  loadtest/                                  documentation and benchmarks
```

Four root files are load bearing and cannot be tidied into a subdirectory:

- **`settings.gradle`** is how Gradle finds the build at all. It is discovered from the invocation directory, so moving it breaks `./gradlew`, IDE import, CI, and the Docker build in one shot. `build.gradle`, `gradlew`, and `gradle/` are anchored to it.
- **`docker-compose*.yml`** are discovered from the current directory too. Compose does not search subdirectories, so moving them turns the one-line quickstart above into `docker compose -f docker/compose.yml ...` everywhere, including every benchmark script.

Everything that *can* move, has. The Dockerfile lives in [docker/Dockerfile](docker/Dockerfile) (compose passes it explicitly with the repo root still as the build context), and the coverage gate lives in [gradle/coverage.gradle](gradle/coverage.gradle) so `build.gradle` stays a plugin and dependency manifest.

`docs/` stays at the root rather than moving under `src/` on purpose: `src/` is the Gradle source root, so every path under it is compiler or resource input. Markdown placed there would either be packaged into the jar or ignored, and GitHub stops rendering `docs/` specially. Documentation is not source.

---

<div align="center">
<img src="docs/Avatar_Costpilot.png" width="80" alt="">
<br>
<sub>Built because a dashboard has never stopped a single dollar from leaving.</sub>
</div>
