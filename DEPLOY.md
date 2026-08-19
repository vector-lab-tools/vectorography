# Deploying Vectorography

One container: the app is built, then served by the same process that holds the
space in memory. There is no separate API host and nothing to configure.

## Hugging Face Spaces

A Space keeps a process alive, so the model is loaded once rather than on every
request. That matters here: the fitted space is tens of megabytes, and a
serverless host reloads it after every idle period.

**A Docker Space needs a PRO subscription.** Static Spaces are free; Gradio and
Docker Spaces on free cpu-basic are not, and the create call returns 402. This
instrument needs a Python process for the decode and for compiling fonts, so a
static Space cannot host it as it stands.

1. Log in once:

   ```
   .venv/bin/hf auth login
   ```

   It prints a URL and a code to enter in a browser. A **write** token is
   needed, not a read one.
2. Push. The Space is created if it does not exist, as a Docker Space on free
   CPU:

   ```
   tools/push-space.sh <owner>/vectorography
   ```

   You will be asked for your username and a **write** access token from
   <https://huggingface.co/settings/tokens>, not your password.

   The CLI handles the large file itself: Hugging Face refuses ordinary git
   pushes of files over 10 MB and the fitted space is about thirty. The corpus
   fonts, the raw encodings and the build directories are left out.
4. The Space builds the Dockerfile at the root and serves on port 7860, which
   the metadata at the top of README.md already declares. First build takes a
   few minutes; after that a push rebuilds it.
5. Check it is loaded rather than merely running: `/api/health` returns the
   model id, the number of families and the dimensionality.

### What is and is not in the image

The fitted space (`backend/data/vectormodel-*.npz`) is committed and ships
inside the image, which is what makes a clone able to travel immediately.

The corpus font files are not: three hundred megabytes of them, and they are
regenerable with `backend/corpus/fetch.py`. Without them `/api/fontfile`
returns 404 and the family list falls back to a plain face rather than setting
each name in its own. Everything else works, since the space was fitted before
the fonts were put away.

## Vercel

Workable, with two caveats worth knowing before choosing it.

The backend is a serverless function, so the model is reloaded after each idle
period: expect one to two seconds on a first request. Storing the components as
float16 halves that.

Compiling a journey runs varLib over several masters and is the endpoint most
likely to meet a duration limit: ten seconds on Hobby, sixty on Pro.

## Anywhere with a persistent process

Fly, Render, Railway, or a machine you already have:

```
docker build -t vectorography .
docker run -p 7860:7860 vectorography
```

512 MB of memory is enough for the current model; a gigabyte is comfortable.
