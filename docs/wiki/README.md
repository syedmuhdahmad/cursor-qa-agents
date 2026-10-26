# Wiki source

These files are the pages of the [wiki](https://github.com/syedmuhdahmad/qa-agent-kit/wiki), one file for each page. Edit them here, in the same pull request as the change they describe, and publish them after it is merged:

```bash
git clone https://github.com/syedmuhdahmad/qa-agent-kit.wiki.git /tmp/qa-wiki
cp docs/wiki/*.md /tmp/qa-wiki/
rm /tmp/qa-wiki/README.md
cd /tmp/qa-wiki && git add -A && git commit -m "Update the wiki" && git push
```

A link such as `[[Getting started]]` works only on the wiki.
