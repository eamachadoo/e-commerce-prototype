
    export type RemoteKeys = 'mips_example_provider/ExamplePage';
    type PackageType<T> = T extends 'mips_example_provider/ExamplePage' ? typeof import('mips_example_provider/ExamplePage') :any;