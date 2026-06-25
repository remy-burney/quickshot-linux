using LightshotLinux.ImageTool;
using SkiaSharp;

namespace LightshotLinux.ImageTool.Tests;

public sealed class ImageRendererTests : IDisposable
{
    private readonly string _tempDirectory = Path.Combine(Path.GetTempPath(), $"lightshot-linux-tests-{Guid.NewGuid():N}");

    public ImageRendererTests()
    {
        Directory.CreateDirectory(_tempDirectory);
    }

    [Fact]
    public void RenderToPngBytes_CropsSelection()
    {
        var sourcePath = CreateSource(10, 10, canvas =>
        {
            canvas.Clear(SKColors.White);
            using var paint = new SKPaint { Color = SKColors.Blue };
            canvas.DrawRect(SKRect.Create(2, 3, 4, 5), paint);
        });

        var request = new ExportRequest
        {
            Selection = new SelectionRect { X = 2, Y = 3, Width = 4, Height = 5 }
        };

        using var rendered = Decode(ImageRenderer.RenderToPngBytes(sourcePath, request));

        Assert.Equal(4, rendered.Width);
        Assert.Equal(5, rendered.Height);
        Assert.Equal(SKColors.Blue, rendered.GetPixel(0, 0));
        Assert.Equal(SKColors.Blue, rendered.GetPixel(3, 4));
    }

    [Fact]
    public void RenderToPngBytes_DrawsPenAndRectangle()
    {
        var sourcePath = CreateSource(60, 60, canvas => canvas.Clear(SKColors.White));
        var request = new ExportRequest
        {
            Selection = new SelectionRect { X = 0, Y = 0, Width = 60, Height = 60 },
            Annotations =
            [
                new()
                {
                    Type = "pen",
                    Color = "#ff0000",
                    Size = 4,
                    Points =
                    [
                        new AnnotationPoint { X = 5, Y = 5 },
                        new AnnotationPoint { X = 25, Y = 5 },
                        new AnnotationPoint { X = 25, Y = 25 }
                    ]
                },
                new()
                {
                    Type = "rectangle",
                    Color = "#00ff00",
                    Size = 3,
                    X = 32,
                    Y = 32,
                    Width = 20,
                    Height = 15
                }
            ]
        };

        using var rendered = Decode(ImageRenderer.RenderToPngBytes(sourcePath, request));

        AssertPixelNear(rendered.GetPixel(15, 5), SKColors.Red);
        AssertPixelNear(rendered.GetPixel(32, 38), SKColors.Lime);
    }

    [Fact]
    public void RenderToPngBytes_DrawsArrowAndHighlighter()
    {
        var sourcePath = CreateSource(90, 40, canvas => canvas.Clear(SKColors.White));
        var request = new ExportRequest
        {
            Selection = new SelectionRect { X = 0, Y = 0, Width = 90, Height = 40 },
            Annotations =
            [
                new()
                {
                    Type = "highlight",
                    Color = "#ffff00",
                    Size = 12,
                    Points =
                    [
                        new AnnotationPoint { X = 5, Y = 25 },
                        new AnnotationPoint { X = 70, Y = 25 }
                    ]
                },
                new()
                {
                    Type = "arrow",
                    Color = "#0000ff",
                    Size = 4,
                    X = 8,
                    Y = 8,
                    X2 = 75,
                    Y2 = 8
                }
            ]
        };

        using var rendered = Decode(ImageRenderer.RenderToPngBytes(sourcePath, request));

        var highlighted = rendered.GetPixel(30, 25);
        Assert.True(highlighted.Red > 240);
        Assert.True(highlighted.Green > 240);
        Assert.True(highlighted.Blue < 220);
        AssertPixelNear(rendered.GetPixel(74, 8), SKColors.Blue, tolerance: 18);
    }

    [Fact]
    public void RenderToPngBytes_DrawsText()
    {
        var sourcePath = CreateSource(120, 50, canvas => canvas.Clear(SKColors.White));
        var request = new ExportRequest
        {
            Selection = new SelectionRect { X = 0, Y = 0, Width = 120, Height = 50 },
            Annotations =
            [
                new()
                {
                    Type = "text",
                    Color = "#111111",
                    FontSize = 24,
                    X = 8,
                    Y = 5,
                    Text = "Hi"
                }
            ]
        };

        using var rendered = Decode(ImageRenderer.RenderToPngBytes(sourcePath, request));

        var hasInk = false;
        for (var y = 0; y < rendered.Height && !hasInk; y++)
        {
            for (var x = 0; x < rendered.Width; x++)
            {
                var pixel = rendered.GetPixel(x, y);
                if (pixel.Red < 120 && pixel.Green < 120 && pixel.Blue < 120)
                {
                    hasInk = true;
                    break;
                }
            }
        }

        Assert.True(hasInk);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDirectory))
        {
            Directory.Delete(_tempDirectory, recursive: true);
        }
    }

    private string CreateSource(int width, int height, Action<SKCanvas> draw)
    {
        var path = Path.Combine(_tempDirectory, $"{Guid.NewGuid():N}.png");
        using var surface = SKSurface.Create(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul));
        draw(surface.Canvas);
        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        File.WriteAllBytes(path, data.ToArray());
        return path;
    }

    private static SKBitmap Decode(byte[] bytes)
    {
        return SKBitmap.Decode(bytes)
            ?? throw new InvalidOperationException("Could not decode rendered PNG.");
    }

    private static void AssertPixelNear(SKColor actual, SKColor expected, byte tolerance = 8)
    {
        Assert.InRange(Math.Abs(actual.Red - expected.Red), 0, tolerance);
        Assert.InRange(Math.Abs(actual.Green - expected.Green), 0, tolerance);
        Assert.InRange(Math.Abs(actual.Blue - expected.Blue), 0, tolerance);
    }
}
