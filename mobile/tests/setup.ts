// The logic under test never touches device storage — `ExplorationStore` takes
// its store as an argument — but the module that supplies the default one
// imports AsyncStorage, and importing that outside an app asks for a native
// module that is not there. The package ships a mock for exactly this.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
