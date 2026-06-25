using SkiaSharp;

namespace LightshotLinux.ImageTool;

public static class ImageRenderer
{
    public static byte[] RenderToPngBytes(string sourcePath, ExportRequest request)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(sourcePath);
        ArgumentNullException.ThrowIfNull(request);

        using var source = SKBitmap.Decode(sourcePath)
            ?? throw new InvalidOperationException($"Could not decode source image: {sourcePath}");

        var crop = BuildCropRect(source, request.Selection);
        using var surface = SKSurface.Create(new SKImageInfo(crop.Width, crop.Height, SKColorType.Rgba8888, SKAlphaType.Premul))
            ?? throw new InvalidOperationException("Could not create render surface.");

        var canvas = surface.Canvas;
        canvas.Clear(SKColors.Transparent);
        canvas.DrawBitmap(source, crop, SKRect.Create(0, 0, crop.Width, crop.Height));

        foreach (var annotation in request.Annotations)
        {
            DrawAnnotation(canvas, annotation);
        }

        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Png, 100)
            ?? throw new InvalidOperationException("Could not encode PNG.");

        return data.ToArray();
    }

    public static void RenderToFile(string sourcePath, ExportRequest request, string outputPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(outputPath);

        var bytes = RenderToPngBytes(sourcePath, request);
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outputPath))!);
        File.WriteAllBytes(outputPath, bytes);
    }

    private static SKRectI BuildCropRect(SKBitmap source, SelectionRect selection)
    {
        if (selection.Width <= 0 || selection.Height <= 0)
        {
            throw new ArgumentException("Selection width and height must be greater than zero.");
        }

        var left = Clamp((int)MathF.Floor(selection.X), 0, source.Width);
        var top = Clamp((int)MathF.Floor(selection.Y), 0, source.Height);
        var right = Clamp((int)MathF.Ceiling(selection.X + selection.Width), 0, source.Width);
        var bottom = Clamp((int)MathF.Ceiling(selection.Y + selection.Height), 0, source.Height);

        if (right <= left || bottom <= top)
        {
            throw new ArgumentException("Selection is outside the source image.");
        }

        return new SKRectI(left, top, right, bottom);
    }

    private static void DrawAnnotation(SKCanvas canvas, Annotation annotation)
    {
        switch (annotation.Type.Trim().ToLowerInvariant())
        {
            case "pen":
                DrawPath(canvas, annotation, alphaOverride: null);
                break;
            case "highlight":
            case "highlighter":
                DrawPath(canvas, annotation, alphaOverride: 95);
                break;
            case "line":
                DrawLine(canvas, annotation, arrow: false);
                break;
            case "arrow":
                DrawLine(canvas, annotation, arrow: true);
                break;
            case "rectangle":
            case "rect":
                DrawRectangle(canvas, annotation);
                break;
            case "text":
                DrawText(canvas, annotation);
                break;
        }
    }

    private static void DrawPath(SKCanvas canvas, Annotation annotation, byte? alphaOverride)
    {
        if (annotation.Points.Count == 0)
        {
            return;
        }

        using var paint = StrokePaint(annotation, alphaOverride);
        using var path = new SKPath();

        path.MoveTo(annotation.Points[0].X, annotation.Points[0].Y);
        for (var i = 1; i < annotation.Points.Count; i++)
        {
            path.LineTo(annotation.Points[i].X, annotation.Points[i].Y);
        }

        canvas.DrawPath(path, paint);
    }

    private static void DrawLine(SKCanvas canvas, Annotation annotation, bool arrow)
    {
        using var paint = StrokePaint(annotation, alphaOverride: null);
        canvas.DrawLine(annotation.X, annotation.Y, annotation.X2, annotation.Y2, paint);

        if (!arrow)
        {
            return;
        }

        var dx = annotation.X2 - annotation.X;
        var dy = annotation.Y2 - annotation.Y;
        var length = MathF.Sqrt(dx * dx + dy * dy);
        if (length < 0.01f)
        {
            return;
        }

        var unitX = dx / length;
        var unitY = dy / length;
        var headLength = MathF.Max(12, annotation.Size * 4);
        var headWidth = MathF.Max(8, annotation.Size * 2.6f);

        var baseX = annotation.X2 - unitX * headLength;
        var baseY = annotation.Y2 - unitY * headLength;
        var perpX = -unitY;
        var perpY = unitX;

        using var fill = FillPaint(annotation, alphaOverride: null);
        using var path = new SKPath();
        path.MoveTo(annotation.X2, annotation.Y2);
        path.LineTo(baseX + perpX * headWidth / 2, baseY + perpY * headWidth / 2);
        path.LineTo(baseX - perpX * headWidth / 2, baseY - perpY * headWidth / 2);
        path.Close();
        canvas.DrawPath(path, fill);
    }

    private static void DrawRectangle(SKCanvas canvas, Annotation annotation)
    {
        using var paint = StrokePaint(annotation, alphaOverride: null);
        canvas.DrawRect(SKRect.Create(annotation.X, annotation.Y, annotation.Width, annotation.Height), paint);
    }

    private static void DrawText(SKCanvas canvas, Annotation annotation)
    {
        var text = annotation.Text;
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        using var paint = FillPaint(annotation, alphaOverride: null);
        paint.IsAntialias = true;

        using var font = new SKFont(SKTypeface.Default, MathF.Max(8, annotation.FontSize));
        var lines = text.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');
        var lineHeight = font.Size * 1.2f;

        for (var i = 0; i < lines.Length; i++)
        {
            canvas.DrawText(lines[i], annotation.X, annotation.Y + font.Size + i * lineHeight, font, paint);
        }
    }

    private static SKPaint StrokePaint(Annotation annotation, byte? alphaOverride)
    {
        return new SKPaint
        {
            IsAntialias = true,
            Color = ParseColor(annotation.Color, alphaOverride),
            StrokeWidth = MathF.Max(1, annotation.Size),
            Style = SKPaintStyle.Stroke,
            StrokeCap = SKStrokeCap.Round,
            StrokeJoin = SKStrokeJoin.Round
        };
    }

    private static SKPaint FillPaint(Annotation annotation, byte? alphaOverride)
    {
        return new SKPaint
        {
            IsAntialias = true,
            Color = ParseColor(annotation.Color, alphaOverride),
            Style = SKPaintStyle.Fill
        };
    }

    private static SKColor ParseColor(string color, byte? alphaOverride)
    {
        var value = string.IsNullOrWhiteSpace(color) ? "#ff0000" : color.Trim();
        if (value.StartsWith('#'))
        {
            value = value[1..];
        }

        if (value.Length is not (6 or 8) || !uint.TryParse(value, System.Globalization.NumberStyles.HexNumber, null, out var parsed))
        {
            return new SKColor(255, 0, 0, alphaOverride ?? 255);
        }

        var r = (byte)((parsed >> (value.Length == 8 ? 24 : 16)) & 0xff);
        var g = (byte)((parsed >> (value.Length == 8 ? 16 : 8)) & 0xff);
        var b = (byte)((parsed >> (value.Length == 8 ? 8 : 0)) & 0xff);
        var a = value.Length == 8 ? (byte)(parsed & 0xff) : (byte)255;

        return new SKColor(r, g, b, alphaOverride ?? a);
    }

    private static int Clamp(int value, int min, int max)
    {
        return Math.Min(max, Math.Max(min, value));
    }
}
