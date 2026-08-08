import Foundation

/// Loads Supabase credentials from the environment or `server/.env`.
enum Env {
    static let supabaseURLKey = "NEXT_PUBLIC_SUPABASE_URL"
    static let supabaseKeyKey = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"

    static var supabaseURL: URL {
        guard let raw = value(supabaseURLKey), let url = URL(string: raw) else {
            fatalError("Missing \(supabaseURLKey). Set it in server/.env or the process environment.")
        }
        return url
    }

    static var supabaseKey: String {
        guard let key = value(supabaseKeyKey), !key.isEmpty else {
            fatalError("Missing \(supabaseKeyKey). Set it in server/.env or the process environment.")
        }
        return key
    }

    static func value(_ key: String) -> String? {
        if let env = ProcessInfo.processInfo.environment[key], !env.isEmpty {
            return env
        }
        return dotEnv[key]
    }

    private static let dotEnv: [String: String] = {
        for candidate in candidatePaths() {
            guard let contents = try? String(contentsOf: candidate, encoding: .utf8) else { continue }
            return parseDotEnv(contents)
        }
        return [:]
    }()

    private static func candidatePaths() -> [URL] {
        var paths: [URL] = []
        let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)

        paths.append(cwd.appendingPathComponent("server/.env"))
        paths.append(cwd.appendingPathComponent(".env"))

        if let resource = Bundle.main.resourceURL {
            paths.append(resource.appendingPathComponent(".env"))
            paths.append(resource.deletingLastPathComponent().appendingPathComponent("server/.env"))
        }

        #if DEBUG
        let sourceFile = URL(fileURLWithPath: #filePath)
        paths.append(sourceFile.deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent(".env"))
        #endif

        return paths
    }

    private static func parseDotEnv(_ contents: String) -> [String: String] {
        var values: [String: String] = [:]
        for line in contents.split(whereSeparator: \.isNewline) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard !trimmed.isEmpty, !trimmed.hasPrefix("#") else { continue }
            let parts = trimmed.split(separator: "=", maxSplits: 1).map(String.init)
            guard parts.count == 2 else { continue }
            let key = parts[0].trimmingCharacters(in: .whitespaces)
            var value = parts[1].trimmingCharacters(in: .whitespaces)
            if (value.hasPrefix("\"") && value.hasSuffix("\"")) || (value.hasPrefix("'") && value.hasSuffix("'")) {
                value = String(value.dropFirst().dropLast())
            }
            values[key] = value
        }
        return values
    }
}
