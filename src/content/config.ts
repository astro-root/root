import { defineCollection, z } from 'astro:content';

/**
 * Blog collection.
 *
 * The schema intentionally mirrors the shape a future browser-based CMS
 * (backed by e.g. Firebase + the Gemini API for writing assistance) would
 * produce, so that swapping the content source later — from local Markdown
 * files to documents fetched from a database — does not require reshaping
 * the data any page already depends on. Every page reads posts through
 * getCollection()/getEntry(), never the filesystem directly, so the source
 * can be swapped behind that boundary.
 */
const blog = defineCollection({
  type: 'content',
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      slugOverride: z.string().optional(), // falls back to the generated slug
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      category: z.enum([
        'Astronomy',
        'Physics',
        'Software',
        'Web Development',
        'Science',
        'Notes'
      ]),
      tags: z.array(z.string()).default([]),
      excerpt: z.string(),
      thumbnail: image().optional(),
      thumbnailAlt: z.string().optional(),
      published: z.boolean().default(true),
      draft: z.boolean().default(false)
    })
});

const projects = defineCollection({
  type: 'content',
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      order: z.number(),
      category: z.enum([
        'Web Service',
        'Software',
        'Tool',
        'Experiment',
        'Research'
      ]),
      status: z.enum(['Active', 'In Development', 'Archived', 'Concept']),
      year: z.string(),
      summary: z.string(),
      technology: z.array(z.string()),
      url: z.string().url().optional(),
      github: z.string().url().optional(),
      featured: z.boolean().default(false),
      cover: image().optional(),
      coverAlt: z.string().optional()
    })
});

/**
 * About page copy lives here — as a single Markdown entry — rather than
 * hardcoded in the page template, so the text can be rewritten later
 * without touching any component or layout code.
 */
const about = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    updated: z.coerce.date()
  })
});

export const collections = { blog, projects, about };
