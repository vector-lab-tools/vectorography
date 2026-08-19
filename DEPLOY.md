# Deploying Vectorography

One container: the app is built, then served by the same process that holds the
space in memory. There is no separate API host and nothing to configure.

## Hugging Face Spaces

A Space keeps a process alive, so the model is loaded once rather than on every
request. That matters here: the fitted space is tens of megabytes, and a
serverless host reloads it after every idle period.

1. Sign in at <https://huggingface.co> and choose **New Space**.
2. Owner: your account or the `vector-lab-tools` org. Name: `vectorography`.
   **Space SDK: Docker** (blank template). Hardware: **CPU basic**, which is
   free. Visibility as you like; public is the point for an instrument with a
   paper behind it.
3. It gives you a git URL. Add it alongside GitHub and push:

   ```
   git remote add space https://huggingface.co/spaces/<owner>/vectorography
   git push space main
   ```

   You will be asked for your username and a **write** access token from
   <https://huggingface.co/settings/tokens>, not your password.
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
