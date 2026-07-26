# Pilot

Site content is offline. Nothing is published from this repository right now.

## Restoring

Every page — the arcade landing, Penguin Cannon, and the CFS Masterclass ("The Wise CA")
reference — is preserved in git history. It has not been deleted, only unpublished.

The last published state is tagged:

```bash
git checkout site-archive-2026-07-26 -- index.html games assets
git commit -m "Restore site content"
git push
```

That single command brings back every file exactly as it was.

## Fully disabling GitHub Pages

Removing the files means the site serves a 404, but the Pages deployment itself is still
configured. To switch it off entirely:

**Settings → Pages → Build and deployment → Source → None**

Re-enable later with branch `main` and folder `/ (root)`.
