import esbuildServe from 'esbuild-serve';

esbuildServe(
    {
        // esbuild options
    },
    {
        // serve options (optional)
        port: 7000,
        root: '.'
    }
);