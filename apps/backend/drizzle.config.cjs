module.exports = {
  schema: './dist-schema/db/schema/index.js',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    get url() {
      if (process.env.NODE_ENV === 'test') {
        if (!process.env.DATABASE_URL_TEST) {
          throw new Error(
            'DATABASE_URL_TEST is required when NODE_ENV=test but is not set. ' +
              'Either set DATABASE_URL_TEST in your environment or unset NODE_ENV.'
          );
        }
        return process.env.DATABASE_URL_TEST;
      }
      if (!process.env.DATABASE_URL) {
        throw new Error(
          'DATABASE_URL is required but is not set. ' +
            'Please set DATABASE_URL in your environment.'
        );
      }
      return process.env.DATABASE_URL;
    },
  },
  verbose: true,
  strict: true,
};
