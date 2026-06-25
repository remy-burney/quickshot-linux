using System.Diagnostics;
using System.Text.Json;

namespace LightshotLinux.ImageTool;

public static class Cli
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    public static async Task<int> RunAsync(string[] args)
    {
        try
        {
            if (args.Length == 0 || args[0] is "-h" or "--help")
            {
                PrintUsage(Console.Out);
                return args.Length == 0 ? 1 : 0;
            }

            if (!string.Equals(args[0], "export", StringComparison.Ordinal))
            {
                throw new ArgumentException($"Unknown command: {args[0]}");
            }

            var options = ExportOptions.Parse(args.Skip(1).ToArray());
            var request = await LoadRequestAsync(options.RequestPath);

            var outputPath = options.OutputPath;
            var deleteOutput = false;
            if (string.IsNullOrWhiteSpace(outputPath))
            {
                outputPath = Path.Combine(Path.GetTempPath(), $"lightshot-linux-{Guid.NewGuid():N}.png");
                deleteOutput = true;
            }

            ImageRenderer.RenderToFile(options.SourcePath, request, outputPath);

            if (options.Copy)
            {
                await WaylandClipboard.CopyPngAsync(outputPath);
            }

            if (!deleteOutput)
            {
                Console.WriteLine(outputPath);
            }
            else
            {
                File.Delete(outputPath);
            }

            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"lightshot-linux-helper: {ex.Message}");
            return 1;
        }
    }

    private static async Task<ExportRequest> LoadRequestAsync(string path)
    {
        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<ExportRequest>(stream, JsonOptions)
            ?? throw new InvalidOperationException($"Could not parse request JSON: {path}");
    }

    private static void PrintUsage(TextWriter writer)
    {
        writer.WriteLine("Usage:");
        writer.WriteLine("  lightshot-linux-helper export --source <full.png> --request <request.json> --output <out.png>");
        writer.WriteLine("  lightshot-linux-helper export --source <full.png> --request <request.json> --copy");
    }

    private sealed class ExportOptions
    {
        public string SourcePath { get; private init; } = "";
        public string RequestPath { get; private init; } = "";
        public string? OutputPath { get; private init; }
        public bool Copy { get; private init; }

        public static ExportOptions Parse(string[] args)
        {
            string? source = null;
            string? request = null;
            string? output = null;
            var copy = false;

            for (var i = 0; i < args.Length; i++)
            {
                switch (args[i])
                {
                    case "--source":
                        source = ReadValue(args, ref i);
                        break;
                    case "--request":
                        request = ReadValue(args, ref i);
                        break;
                    case "--output":
                        output = ReadValue(args, ref i);
                        break;
                    case "--copy":
                        copy = true;
                        break;
                    default:
                        throw new ArgumentException($"Unknown option: {args[i]}");
                }
            }

            if (string.IsNullOrWhiteSpace(source))
            {
                throw new ArgumentException("--source is required.");
            }

            if (string.IsNullOrWhiteSpace(request))
            {
                throw new ArgumentException("--request is required.");
            }

            if (string.IsNullOrWhiteSpace(output) && !copy)
            {
                throw new ArgumentException("Either --output or --copy is required.");
            }

            return new ExportOptions
            {
                SourcePath = source,
                RequestPath = request,
                OutputPath = output,
                Copy = copy
            };
        }

        private static string ReadValue(string[] args, ref int index)
        {
            if (index + 1 >= args.Length)
            {
                throw new ArgumentException($"{args[index]} requires a value.");
            }

            index++;
            return args[index];
        }
    }
}

public static class WaylandClipboard
{
    public static async Task CopyPngAsync(string imagePath)
    {
        if (!File.Exists(imagePath))
        {
            throw new FileNotFoundException("Clipboard source image was not found.", imagePath);
        }

        var wlCopy = FindExecutable("wl-copy")
            ?? throw new InvalidOperationException("wl-copy is required for clipboard support.");

        var startInfo = new ProcessStartInfo(wlCopy, "--type image/png")
        {
            RedirectStandardInput = true,
            RedirectStandardError = false,
            UseShellExecute = false
        };

        using var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException("Could not start wl-copy.");

        await using (var source = File.OpenRead(imagePath))
        {
            await source.CopyToAsync(process.StandardInput.BaseStream);
        }

        process.StandardInput.Close();
        var exited = await WaitForExitAsync(process, TimeSpan.FromMilliseconds(750));

        if (exited && process.ExitCode != 0)
        {
            throw new InvalidOperationException($"wl-copy failed with exit code {process.ExitCode}.");
        }
    }

    private static async Task<bool> WaitForExitAsync(Process process, TimeSpan timeout)
    {
        var waitTask = process.WaitForExitAsync();
        var completed = await Task.WhenAny(waitTask, Task.Delay(timeout));
        return completed == waitTask;
    }

    private static string? FindExecutable(string executable)
    {
        foreach (var candidate in new[] { $"/usr/bin/{executable}", $"/usr/local/bin/{executable}" })
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        var path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var directory in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            var candidate = Path.Combine(directory, executable);
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }
}
