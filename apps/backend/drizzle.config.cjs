module.exports = {
  schema: './dist/db/schema.js',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://branchforge:branchforge@localhost:5432/branchforge',
  },
  verbose: true,
  strict: true,
};
