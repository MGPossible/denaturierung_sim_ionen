# Native PDB coordinate resource

`1LYZ.pdb` is the experimental hen egg-white lysozyme structure from the RCSB Protein Data Bank. The project preparation script downloads the official coordinate file into this folder and validates chain A (129 Cα positions) and the four `SSBOND` records.

The built website serves this file locally at `data/1LYZ.pdb`; the browser does not request structure coordinates from an external API.

Source: https://www.rcsb.org/structure/1LYZ
Official download: https://files.rcsb.org/download/1LYZ.pdb
