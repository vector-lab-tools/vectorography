# Deploying Vectorography

One container: the app is built, then served by the same process that holds the
space in memory. There is no separate API host and nothing to configure.

## Where it runs now

Nowhere. The Cloud Run service was taken down because its billing is metered
and the bill is not knowable in advance.

What this app needs from a host is small and specific: one process that stays
alive, about 150 MB of memory, and no GPU. Measured on a loaded backend, the
Python process holds **104 MB resident** with VectorModel 0.2 in memory, so a
512 MB tier is enough and a gigabyte is comfortable.

Hosts with a fixed price or a hard stop, which is the property that matters
here:

| Host | Cost | Notes |
|---|---|---|
| Render, free web service | nothing, no card | 512 MB, sleeps after 15 minutes idle, cold start around a minute |
| A small VPS (Hetzner, Scaleway, Mythic Beasts) | €4 to £5 a month, flat | `docker run` and a reverse proxy; the bill cannot move |
| Hugging Face Spaces | $9 a month, flat | PRO subscription; Docker Spaces are no longer free. The repository is already shaped for it |
| Fly.io, Railway, Cloud Run | metered | the same open-ended bill the move was made to avoid |

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
A loaded backend measures 104 MB resident.

## Google Cloud Run

Kept for the record. The hosted instance ran here and no longer does.

Cloud Build compiles the `Dockerfile` in the cloud, so Docker is not needed on
the machine you deploy from. The container scales to zero between visits and a
warm request costs nothing to serve; a cold one spends a few seconds starting
Python and reading the model.

Once, by hand, because both steps need a person:

```
gcloud auth login
gcloud projects create vectorography          # or reuse an existing project
```

Then attach a billing account at
<https://console.cloud.google.com/billing>. Cloud Run's free allowance covers
this workload comfortably, but Google will not run a service on a project with
no billing account behind it.

After that:

```
./tools/deploy-cloudrun.sh
```

Region defaults to `europe-west2`, London. Override with `REGION=`, `PROJECT=`
or `SERVICE=` in the environment.

The service is deployed `--allow-unauthenticated`, which is what makes the URL
public. Memory is 1Gi: numpy, scipy and fontTools are resident alongside the
model, and compiling a journey holds a font per master.

The container binds `$PORT` when the environment sets one and 7860 when it
does not, so the same image serves both Cloud Run and Spaces.

### If the first build is refused

A project created after mid-2024 starts with a Compute Engine default service
account that holds no build permissions, and the first deploy stops with
`PERMISSION_DENIED ... could not resolve source`. Cloud Build runs as that
account, so it needs granting once:

```
SA="$(gcloud projects describe "$PROJECT" \
      --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$SA" --role=roles/cloudbuild.builds.builder
```

The grant takes a minute or so to propagate. Deploy again after it does.

### Billing

Linking a billing account is not the same as billing being on. An account that
has been closed still links, `billingEnabled` stays false, and the API enable
step fails with `UREQ_PROJECT_BILLING_NOT_OPEN`. Check with:

```
gcloud billing accounts list          # the OPEN column
gcloud billing projects describe "$PROJECT"
```

## A name worth typing

<https://vectorography.web.app> is Firebase Hosting standing in front of the
Cloud Run service. Hosting serves nothing itself: `firebase.json` rewrites
every path to the container, which already serves the app and the space
together.

```
firebase deploy --only hosting --project vectorography
```

The rewrite only works because Hosting and the service are in the same
project. Adding Firebase to an existing Cloud project is what makes that true,
and it is `firebase projects:addfirebase vectorography`, not the console's
"Add project", which creates a separate project with a name of its own and no
way to reach the service. That command returned 403 the first time and
succeeded unchanged the second, so retry before believing it.
